package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"ita-refactor/services/conversation-write-gateway/internal/adapter/commandlog"
	"ita-refactor/services/conversation-write-gateway/internal/adapter/event"
	"ita-refactor/services/conversation-write-gateway/internal/adapter/httpapi"
	"ita-refactor/services/conversation-write-gateway/internal/adapter/postgres"
	"ita-refactor/services/conversation-write-gateway/internal/platform"
	"ita-refactor/services/conversation-write-gateway/internal/usecase"
)

func main() {
	ctx := context.Background()
	pool := mustOpenPostgres(ctx)
	defer pool.Close()
	poolDB := postgres.NewPoolDB(pool)
	repository := conversationRepositoryFromConfig(poolDB)
	defer repository.Close()

	createConversation := usecase.NewCreateConversation(
		repository.Repository,
		event.NoopPublisher{},
		platform.IDGenerator{},
		platform.Clock{},
	)
	connectionStates := newConnectionStateTracker()

	server := &http.Server{
		Addr: ":" + getenv("PORT", "18080"),
		Handler: httpapi.NewServerWithConfig(httpapi.ServerConfig{
			CreateConversation:   createConversation,
			AgentAPIKey:          getenv("AGENT_API_KEY", "ueacd"),
			DiagnosticsSecret:    getenv("INTERNAL_DIAGNOSTICS_SECRET", "ueacd"),
			DBPoolStatsProvider:  poolDB,
			RuntimeStatsProvider: connectionStates,
			CommandLogProvider:   repository.CommandLogProvider,
		}).Handler(),
		ConnState:         connectionStates.ConnState,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("conversation-write-gateway listening on %s", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

type connectionStateTracker struct {
	mu     sync.Mutex
	states map[net.Conn]http.ConnState
	stats  platform.ConversationRuntimeStats
}

func newConnectionStateTracker() *connectionStateTracker {
	return &connectionStateTracker{states: map[net.Conn]http.ConnState{}}
}

func (c *connectionStateTracker) ConnState(conn net.Conn, state http.ConnState) {
	c.mu.Lock()
	defer c.mu.Unlock()

	old, known := c.states[conn]
	if state == http.StateNew && !known {
		c.stats.AcceptedConns++
		c.stats.CurrentConns++
		if c.stats.CurrentConns > c.stats.MaxCurrentConns {
			c.stats.MaxCurrentConns = c.stats.CurrentConns
		}
	}

	c.decrementState(old, known)
	switch state {
	case http.StateNew:
		c.states[conn] = state
	case http.StateActive:
		c.stats.ActiveConns++
		c.states[conn] = state
	case http.StateIdle:
		c.stats.IdleConns++
		c.states[conn] = state
	case http.StateHijacked:
		c.stats.HijackedConns++
		if known {
			c.stats.CurrentConns--
		}
		delete(c.states, conn)
	case http.StateClosed:
		c.stats.ClosedConns++
		if known {
			c.stats.CurrentConns--
		}
		delete(c.states, conn)
	}
}

func (c *connectionStateTracker) ConversationRuntimeStats() platform.ConversationRuntimeStats {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.stats
}

func (c *connectionStateTracker) decrementState(state http.ConnState, known bool) {
	if !known {
		return
	}
	switch state {
	case http.StateActive:
		c.stats.ActiveConns--
	case http.StateIdle:
		c.stats.IdleConns--
	}
}

func mustOpenPostgres(ctx context.Context) *pgxpool.Pool {
	databaseURL := getenv(
		"DATABASE_URL",
		"postgres://app_user:ueacd@127.0.0.1:5433/intelligent_teaching_assistant?sslmode=disable",
	)
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		log.Fatal(err)
	}

	settings, err := conversationPostgresPoolSettingsFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	applyConversationPostgresPoolSettings(config, settings)
	config.MaxConnIdleTime = 10 * time.Minute
	config.MaxConnLifetime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		log.Fatal(err)
	}
	if err := prewarmConversationPostgresPool(ctx, pool, settings.PrewarmConns); err != nil {
		pool.Close()
		log.Fatal(err)
	}
	poolDB := postgres.NewPoolDB(pool)
	if err := retryConversationStartupOperation(ctx, 8, 100*time.Millisecond, func() error {
		return postgres.EnsureSchema(ctx, poolDB)
	}); err != nil {
		pool.Close()
		log.Fatal(err)
	}
	log.Printf(
		"conversation postgres pool ready: maxConns=%d minConns=%d prewarmConns=%d",
		settings.MaxConns,
		settings.MinConns,
		settings.PrewarmConns,
	)
	return pool
}

type conversationPostgresPoolSettings struct {
	MaxConns     int
	MinConns     int
	PrewarmConns int
}

func conversationPostgresPoolSettingsFromEnv() (conversationPostgresPoolSettings, error) {
	return parseConversationPostgresPoolSettings(os.Getenv)
}

func parseConversationPostgresPoolSettings(getenv func(string) string) (conversationPostgresPoolSettings, error) {
	settings := conversationPostgresPoolSettings{}
	var err error
	settings.MaxConns, err = getenvIntFrom(getenv, "DB_MAX_CONNS", 8, true)
	if err != nil {
		return conversationPostgresPoolSettings{}, err
	}
	settings.MinConns, err = getenvIntFrom(getenv, "DB_MIN_CONNS", settings.MaxConns, false)
	if err != nil {
		return conversationPostgresPoolSettings{}, err
	}
	settings.PrewarmConns, err = getenvIntFrom(getenv, "DB_PREWARM_CONNS", 1, false)
	if err != nil {
		return conversationPostgresPoolSettings{}, err
	}
	if settings.MinConns > settings.MaxConns {
		return conversationPostgresPoolSettings{}, fmt.Errorf("DB_MIN_CONNS must be <= DB_MAX_CONNS: %d > %d", settings.MinConns, settings.MaxConns)
	}
	if settings.PrewarmConns > settings.MaxConns {
		return conversationPostgresPoolSettings{}, fmt.Errorf("DB_PREWARM_CONNS must be <= DB_MAX_CONNS: %d > %d", settings.PrewarmConns, settings.MaxConns)
	}
	return settings, nil
}

func applyConversationPostgresPoolSettings(config *pgxpool.Config, settings conversationPostgresPoolSettings) {
	config.MaxConns = int32(settings.MaxConns)
	config.MinConns = int32(settings.MinConns)
}

func prewarmConversationPostgresPool(ctx context.Context, pool *pgxpool.Pool, count int) error {
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
		connection, err := acquireConversationPrewarmPostgresConnection(ctx, pool)
		if err != nil {
			return err
		}
		connections = append(connections, connection)
	}
	return nil
}

func acquireConversationPrewarmPostgresConnection(ctx context.Context, pool *pgxpool.Pool) (*pgxpool.Conn, error) {
	var connection *pgxpool.Conn
	err := retryConversationStartupOperation(ctx, 8, 100*time.Millisecond, func() error {
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

func retryConversationStartupOperation(ctx context.Context, attempts int, delay time.Duration, operation func() error) error {
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

type conversationRepositoryBundle struct {
	Repository         usecase.ConversationRepository
	CommandLogProvider platform.ConversationCommandLogStatsProvider
}

func (bundle conversationRepositoryBundle) Close() {
	if closer, ok := bundle.Repository.(interface{ Close() }); ok {
		closer.Close()
	}
}

func conversationRepositoryFromConfig(db postgres.DB) conversationRepositoryBundle {
	projection := conversationProjectionRepositoryFromConfig(db)
	if conversationWriteAcceptanceModeFromConfig() == "durable-log" {
		repository, err := commandlog.NewRepository(commandlog.Config{
			Path:              getenv("CONVERSATION_COMMAND_LOG_PATH", "data/conversation-commands.jsonl"),
			AppendBatchSize:   getenvInt("CONVERSATION_COMMAND_LOG_APPEND_BATCH_SIZE", 32),
			AppendMaxDelay:    time.Duration(getenvInt("CONVERSATION_COMMAND_LOG_APPEND_DELAY_MS", 0)) * time.Millisecond,
			QueueCapacity:     getenvInt("CONVERSATION_COMMAND_LOG_QUEUE_CAPACITY", 65536),
			ProjectionWorkers: getenvInt("CONVERSATION_COMMAND_LOG_PROJECTION_WORKERS", 4),
			Sync:              getenvBool("CONVERSATION_COMMAND_LOG_SYNC", true),
			Projection:        projection,
		})
		if err != nil {
			log.Fatal(err)
		}
		return conversationRepositoryBundle{
			Repository:         repository,
			CommandLogProvider: repository,
		}
	}
	return conversationRepositoryBundle{Repository: projection}
}

func conversationProjectionRepositoryFromConfig(db postgres.DB) usecase.ConversationRepository {
	batchSize := getenvInt("CONVERSATION_WRITE_BATCH_SIZE", 1)
	if batchSize <= 1 {
		return postgres.NewConversationRepository(db)
	}
	return postgres.NewBatchingConversationRepository(db, postgres.BatchConfig{
		MaxSize:  batchSize,
		MaxDelay: time.Duration(getenvInt("CONVERSATION_WRITE_BATCH_DELAY_MS", 0)) * time.Millisecond,
		Workers:  getenvInt("CONVERSATION_WRITE_BATCH_WORKERS", 1),
		Mode:     conversationWriteBatchModeFromConfig(),
	})
}

func conversationWriteAcceptanceModeFromConfig() string {
	value := getenv("CONVERSATION_WRITE_ACCEPTANCE_MODE", "sync")
	switch value {
	case "sync":
		return value
	case "durable-log":
		return value
	default:
		panic(fmt.Sprintf("CONVERSATION_WRITE_ACCEPTANCE_MODE must be %q or %q: %q", "sync", "durable-log", value))
	}
}

func conversationWriteBatchModeFromConfig() postgres.BatchWriteMode {
	value := getenv("CONVERSATION_WRITE_BATCH_MODE", string(postgres.BatchWriteModeInsert))
	switch postgres.BatchWriteMode(value) {
	case postgres.BatchWriteModeInsert:
		return postgres.BatchWriteModeInsert
	case postgres.BatchWriteModeCopy:
		return postgres.BatchWriteModeCopy
	default:
		panic(fmt.Sprintf("CONVERSATION_WRITE_BATCH_MODE must be %q or %q: %q", postgres.BatchWriteModeInsert, postgres.BatchWriteModeCopy, value))
	}
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
	return parsed
}

func getenvBool(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	switch value {
	case "true", "1", "yes":
		return true
	case "false", "0", "no":
		return false
	default:
		panic(fmt.Sprintf("%s must be a boolean: %q", key, value))
	}
}

func getenvIntFrom(getenv func(string) string, key string, fallback int, positive bool) (int, error) {
	value := getenv(key)
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %q", key, value)
	}
	if positive && parsed <= 0 {
		return 0, fmt.Errorf("%s must be > 0: %d", key, parsed)
	}
	if !positive && parsed < 0 {
		return 0, fmt.Errorf("%s must be >= 0: %d", key, parsed)
	}
	return parsed, nil
}
