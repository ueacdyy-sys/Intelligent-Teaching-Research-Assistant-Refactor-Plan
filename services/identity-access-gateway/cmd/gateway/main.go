package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"ita-refactor/services/identity-access-gateway/internal/adapter/bootstrap"
	"ita-refactor/services/identity-access-gateway/internal/adapter/httpapi"
	"ita-refactor/services/identity-access-gateway/internal/adapter/legacyauth"
	identitypostgres "ita-refactor/services/identity-access-gateway/internal/adapter/postgres"
	"ita-refactor/services/identity-access-gateway/internal/platform"
	"ita-refactor/services/identity-access-gateway/internal/usecase"
)

func main() {
	ctx := context.Background()
	sessionStore, replayGuard, sessionDBPoolStatsProvider, closeSessionStore := mustBuildIdentityStores(ctx)
	defer closeSessionStore()

	tokenIssuer := platform.TokenIssuer{OwnerID: getenv("IDENTITY_TOKEN_OWNER", "")}
	identity := usecase.NewIdentityServiceWithWeChatAndReplayGuard(
		passwordAuthenticator(),
		bootstrap.NewWeChatAuthenticator(getenv("WECHAT_BOOTSTRAP_CODE", "ueacd")),
		replayGuard,
		sessionStore,
		tokenIssuer,
		platform.Clock{},
	)

	server := &http.Server{
		Addr: ":" + getenv("PORT", "18100"),
		Handler: httpapi.NewServerWithConfig(httpapi.ServerConfig{
			Identity:                   identity,
			ChannelSignature:           getenv("CHANNEL_SIGNATURE_SECRET", "ueacd"),
			DiagnosticsSecret:          getenv("INTERNAL_DIAGNOSTICS_SECRET", "ueacd"),
			SessionDBPoolStatsProvider: sessionDBPoolStatsProvider,
		}).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("identity-access-gateway listening on %s", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func mustBuildIdentityStores(ctx context.Context) (usecase.SessionStore, usecase.RemoteCommandReplayGuard, platform.SessionDBPoolStatsProvider, func()) {
	databaseURL := os.Getenv("SESSION_DATABASE_URL")
	if databaseURL == "" {
		log.Print("identity session store ready: memory with local remote replay guard")
		return usecase.NewMemorySessionStore(), usecase.NewMemoryRemoteCommandReplayGuard(), nil, func() {}
	}

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		log.Fatal(err)
	}

	queryExecModeName, queryExecMode, err := parseSessionDBQueryExecMode(os.Getenv("SESSION_DB_QUERY_EXEC_MODE"))
	if err != nil {
		log.Fatal(err)
	}
	maxConns := getenvInt("SESSION_DB_MAX_CONNS", 8)
	minConns, err := parseSessionDBMinConns(os.Getenv("SESSION_DB_MIN_CONNS"), maxConns)
	if err != nil {
		log.Fatal(err)
	}
	prewarmConns, err := parseSessionDBPrewarmConns(os.Getenv("SESSION_DB_PREWARM_CONNS"), maxConns)
	if err != nil {
		log.Fatal(err)
	}
	writeConcurrency := getenvNonNegativeInt("SESSION_DB_WRITE_CONCURRENCY", 0)
	accessCacheMaxEntries := getenvNonNegativeInt("SESSION_ACCESS_CACHE_MAX_ENTRIES", 0)
	accessCacheTTL := getenvDurationMs("SESSION_ACCESS_CACHE_TTL_MS", 30*time.Second)
	sessionTablePersistence, err := parseSessionTablePersistence(os.Getenv("SESSION_DB_SESSION_TABLE_PERSISTENCE"))
	if err != nil {
		log.Fatal(err)
	}
	config.MaxConns = int32(maxConns)
	config.MinConns = int32(minConns)
	config.ConnConfig.DefaultQueryExecMode = queryExecMode
	config.MaxConnIdleTime = 10 * time.Minute
	config.MaxConnLifetime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		log.Fatal(err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		log.Fatal(err)
	}
	db := identitypostgres.NewPoolDB(pool)
	if err := identitypostgres.EnsureSchemaWithConfig(ctx, db, identitypostgres.SchemaConfig{
		SessionTablePersistence: sessionTablePersistence,
	}); err != nil {
		pool.Close()
		log.Fatal(err)
	}
	if err := prewarmSessionDBPool(ctx, pool, prewarmConns); err != nil {
		pool.Close()
		log.Fatal(err)
	}

	readDB, readProfile, closeReadPool := mustBuildIdentityReadPool(ctx, databaseURL, queryExecModeName, queryExecMode)
	store := identitypostgres.NewSessionStoreWithConfig(db, identitypostgres.SessionStoreConfig{
		WriteConcurrency: writeConcurrency,
		ReadDB:           readDB,
		AccessCache: identitypostgres.SessionAccessCacheConfig{
			MaxEntries: accessCacheMaxEntries,
			TTL:        accessCacheTTL,
		},
	})
	statsProvider := identitypostgres.NewSessionDBStatsProvider(db, store)
	log.Printf(
		"identity session store ready: postgres maxConns=%d minConns=%d prewarmConns=%d queryExecMode=%s writeConcurrency=%d readPool=%s accessCacheMaxEntries=%d accessCacheTTL=%s sessionTablePersistence=%s with durable remote replay guard",
		maxConns,
		minConns,
		prewarmConns,
		queryExecModeName,
		writeConcurrency,
		readProfile,
		accessCacheMaxEntries,
		accessCacheTTL,
		sessionTablePersistence,
	)
	return store, store, statsProvider, func() {
		if closeReadPool != nil {
			closeReadPool()
		}
		pool.Close()
	}
}

func mustBuildIdentityReadPool(
	ctx context.Context,
	writeDatabaseURL string,
	defaultQueryExecModeName string,
	defaultQueryExecMode pgx.QueryExecMode,
) (identitypostgres.DB, string, func()) {
	readMaxConns := getenvNonNegativeInt("SESSION_DB_READ_MAX_CONNS", 0)
	if readMaxConns == 0 {
		return nil, "shared", nil
	}
	readDatabaseURL := getenv("SESSION_READ_DATABASE_URL", writeDatabaseURL)
	readConfig, err := pgxpool.ParseConfig(readDatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	readQueryExecModeName := defaultQueryExecModeName
	readQueryExecMode := defaultQueryExecMode
	if strings.TrimSpace(os.Getenv("SESSION_DB_READ_QUERY_EXEC_MODE")) != "" {
		readQueryExecModeName, readQueryExecMode, err = parseSessionDBQueryExecMode(os.Getenv("SESSION_DB_READ_QUERY_EXEC_MODE"))
		if err != nil {
			log.Fatal(err)
		}
	}
	readMinConns, err := parseSessionDBMinConns(os.Getenv("SESSION_DB_READ_MIN_CONNS"), readMaxConns)
	if err != nil {
		log.Fatal(err)
	}
	readPrewarmConns, err := parseSessionDBPrewarmConns(os.Getenv("SESSION_DB_READ_PREWARM_CONNS"), readMaxConns)
	if err != nil {
		log.Fatal(err)
	}
	readConfig.MaxConns = int32(readMaxConns)
	readConfig.MinConns = int32(readMinConns)
	readConfig.ConnConfig.DefaultQueryExecMode = readQueryExecMode
	readConfig.MaxConnIdleTime = 10 * time.Minute
	readConfig.MaxConnLifetime = 30 * time.Minute

	readPool, err := pgxpool.NewWithConfig(ctx, readConfig)
	if err != nil {
		log.Fatal(err)
	}
	if err := readPool.Ping(ctx); err != nil {
		readPool.Close()
		log.Fatal(err)
	}
	if err := prewarmSessionDBPool(ctx, readPool, readPrewarmConns); err != nil {
		readPool.Close()
		log.Fatal(err)
	}
	profile := fmt.Sprintf(
		"dedicated maxConns=%d minConns=%d prewarmConns=%d queryExecMode=%s",
		readMaxConns,
		readMinConns,
		readPrewarmConns,
		readQueryExecModeName,
	)
	return identitypostgres.NewPoolDB(readPool), profile, readPool.Close
}

func passwordAuthenticator() usecase.PasswordAuthenticator {
	legacyBaseURL := os.Getenv("LEGACY_AUTH_BASE_URL")
	if legacyBaseURL != "" {
		return legacyauth.NewAuthenticator(legacyBaseURL, &http.Client{Timeout: 5 * time.Second})
	}
	return bootstrap.Authenticator{Password: getenv("BOOTSTRAP_PASSWORD", "ueacd")}
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getenvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		panic(fmt.Sprintf("%s must be an integer: %q", key, value))
	}
	if parsed < 1 {
		panic(fmt.Sprintf("%s must be positive: %d", key, parsed))
	}
	return parsed
}

func getenvNonNegativeInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		panic(fmt.Sprintf("%s must be an integer: %q", key, value))
	}
	if parsed < 0 {
		panic(fmt.Sprintf("%s must be non-negative: %d", key, parsed))
	}
	return parsed
}

func getenvDurationMs(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		panic(fmt.Sprintf("%s must be an integer millisecond value: %q", key, value))
	}
	if parsed < 0 {
		panic(fmt.Sprintf("%s must be non-negative: %d", key, parsed))
	}
	return time.Duration(parsed) * time.Millisecond
}

func parseSessionDBMinConns(value string, maxConns int) (int, error) {
	if strings.TrimSpace(value) == "" {
		return 0, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("SESSION_DB_MIN_CONNS must be an integer: %q", value)
	}
	if parsed < 0 {
		return 0, fmt.Errorf("SESSION_DB_MIN_CONNS must be non-negative: %d", parsed)
	}
	if parsed > maxConns {
		return 0, fmt.Errorf("SESSION_DB_MIN_CONNS must be <= SESSION_DB_MAX_CONNS: %d > %d", parsed, maxConns)
	}
	return parsed, nil
}

func parseSessionDBPrewarmConns(value string, maxConns int) (int, error) {
	if strings.TrimSpace(value) == "" {
		return 1, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("SESSION_DB_PREWARM_CONNS must be an integer: %q", value)
	}
	if parsed < 0 {
		return 0, fmt.Errorf("SESSION_DB_PREWARM_CONNS must be non-negative: %d", parsed)
	}
	if parsed > maxConns {
		return 0, fmt.Errorf("SESSION_DB_PREWARM_CONNS must be <= SESSION_DB_MAX_CONNS: %d > %d", parsed, maxConns)
	}
	return parsed, nil
}

func parseSessionDBQueryExecMode(value string) (string, pgx.QueryExecMode, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "cache_statement":
		return "cache_statement", pgx.QueryExecModeCacheStatement, nil
	case "cache_describe":
		return "cache_describe", pgx.QueryExecModeCacheDescribe, nil
	case "describe_exec":
		return "describe_exec", pgx.QueryExecModeDescribeExec, nil
	case "exec":
		return "exec", pgx.QueryExecModeExec, nil
	case "simple_protocol":
		return "simple_protocol", pgx.QueryExecModeSimpleProtocol, nil
	default:
		return "", 0, fmt.Errorf(
			"SESSION_DB_QUERY_EXEC_MODE must be cache_statement, cache_describe, describe_exec, exec, or simple_protocol: %q",
			value,
		)
	}
}

func prewarmSessionDBPool(ctx context.Context, pool *pgxpool.Pool, count int) error {
	if count == 0 {
		return nil
	}
	connections := make([]*pgxpool.Conn, 0, count)
	defer func() {
		for _, connection := range connections {
			connection.Release()
		}
	}()
	for index := 0; index < count; index++ {
		connection, err := acquirePrewarmSessionDBConnection(ctx, pool)
		if err != nil {
			return err
		}
		connections = append(connections, connection)
	}
	return nil
}

func acquirePrewarmSessionDBConnection(ctx context.Context, pool *pgxpool.Pool) (*pgxpool.Conn, error) {
	var connection *pgxpool.Conn
	err := retrySessionDBStartupOperation(ctx, 8, 100*time.Millisecond, func() error {
		acquired, err := pool.Acquire(ctx)
		if err != nil {
			return err
		}
		if err := acquired.Ping(ctx); err != nil {
			acquired.Release()
			return err
		}
		connection = acquired
		return nil
	})
	return connection, err
}

func retrySessionDBStartupOperation(ctx context.Context, attempts int, delay time.Duration, operation func() error) error {
	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		lastErr = operation()
		if lastErr == nil {
			return nil
		}
		if attempt == attempts {
			break
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return errors.Join(lastErr, ctx.Err())
		case <-timer.C:
		}
	}
	return lastErr
}

func parseSessionTablePersistence(value string) (identitypostgres.SessionTablePersistence, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", string(identitypostgres.SessionTablePersistenceLogged):
		return identitypostgres.SessionTablePersistenceLogged, nil
	case string(identitypostgres.SessionTablePersistenceUnlogged):
		return identitypostgres.SessionTablePersistenceUnlogged, nil
	default:
		return "", fmt.Errorf(
			"SESSION_DB_SESSION_TABLE_PERSISTENCE must be %q or %q: %q",
			identitypostgres.SessionTablePersistenceLogged,
			identitypostgres.SessionTablePersistenceUnlogged,
			value,
		)
	}
}
