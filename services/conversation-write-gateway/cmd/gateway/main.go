package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
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

	createConversation := usecase.NewCreateConversation(
		postgres.NewConversationRepository(postgres.NewPoolDB(pool)),
		event.NoopPublisher{},
		platform.IDGenerator{},
		platform.Clock{},
	)

	server := &http.Server{
		Addr:              ":" + getenv("PORT", "18080"),
		Handler:           httpapi.NewServer(createConversation, getenv("AGENT_API_KEY", "ueacd")).Handler(),
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
