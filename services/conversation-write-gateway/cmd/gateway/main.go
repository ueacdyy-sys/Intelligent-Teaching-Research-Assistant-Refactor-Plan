package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

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

	createConversation := usecase.NewCreateConversation(
		conversationRepositoryFromConfig(poolDB),
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

	maxConns := getenvInt("DB_MAX_CONNS", 8)
	config.MaxConns = int32(maxConns)
	config.MinConns = int32(maxConns)
	config.MaxConnIdleTime = 10 * time.Minute
	config.MaxConnLifetime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		log.Fatal(err)
	}
	if err := pool.Ping(ctx); err != nil {
		log.Fatal(err)
	}
	if err := postgres.EnsureSchema(ctx, postgres.NewPoolDB(pool)); err != nil {
		log.Fatal(err)
	}
	log.Printf("postgres pool ready: maxConns=%d", maxConns)
	return pool
}

func conversationRepositoryFromConfig(db postgres.DB) usecase.ConversationRepository {
	batchSize := getenvInt("CONVERSATION_WRITE_BATCH_SIZE", 1)
	if batchSize <= 1 {
		return postgres.NewConversationRepository(db)
	}
	return postgres.NewBatchingConversationRepository(db, postgres.BatchConfig{
		MaxSize:  batchSize,
		MaxDelay: time.Duration(getenvInt("CONVERSATION_WRITE_BATCH_DELAY_MS", 0)) * time.Millisecond,
	})
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
