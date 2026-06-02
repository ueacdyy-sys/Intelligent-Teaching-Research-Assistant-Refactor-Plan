package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

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

	identity := usecase.NewIdentityServiceWithWeChatAndReplayGuard(
		passwordAuthenticator(),
		bootstrap.NewWeChatAuthenticator(getenv("WECHAT_BOOTSTRAP_CODE", "ueacd")),
		replayGuard,
		sessionStore,
		platform.TokenIssuer{},
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

	maxConns := getenvInt("SESSION_DB_MAX_CONNS", 8)
	minConns, err := parseSessionDBMinConns(os.Getenv("SESSION_DB_MIN_CONNS"), maxConns)
	if err != nil {
		log.Fatal(err)
	}
	writeConcurrency := getenvNonNegativeInt("SESSION_DB_WRITE_CONCURRENCY", 0)
	sessionTablePersistence, err := parseSessionTablePersistence(os.Getenv("SESSION_DB_SESSION_TABLE_PERSISTENCE"))
	if err != nil {
		log.Fatal(err)
	}
	config.MaxConns = int32(maxConns)
	config.MinConns = int32(minConns)
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

	store := identitypostgres.NewSessionStoreWithConfig(db, identitypostgres.SessionStoreConfig{
		WriteConcurrency: writeConcurrency,
	})
	statsProvider := identitypostgres.NewSessionDBStatsProvider(db, store)
	log.Printf(
		"identity session store ready: postgres maxConns=%d minConns=%d writeConcurrency=%d sessionTablePersistence=%s with durable remote replay guard",
		maxConns,
		minConns,
		writeConcurrency,
		sessionTablePersistence,
	)
	return store, store, statsProvider, pool.Close
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
