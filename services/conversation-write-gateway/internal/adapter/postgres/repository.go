package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"ita-refactor/services/conversation-write-gateway/internal/domain"
	"ita-refactor/services/conversation-write-gateway/internal/platform"
)

type ExecDB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

type DB interface {
	ExecDB
	Acquire(ctx context.Context) (Conn, error)
}

type Conn interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Release()
}

type ConversationRepository struct {
	db DB
}

type PoolDB struct {
	pool *pgxpool.Pool
}

type poolConn struct {
	conn *pgxpool.Conn
}

func NewPoolDB(pool *pgxpool.Pool) PoolDB {
	return PoolDB{pool: pool}
}

func (db PoolDB) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return db.pool.Exec(ctx, sql, args...)
}

func (db PoolDB) Acquire(ctx context.Context) (Conn, error) {
	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	return poolConn{conn: conn}, nil
}

func (db PoolDB) ConversationDBPoolStats() platform.ConversationDBPoolStats {
	stats := db.pool.Stat()
	return platform.ConversationDBPoolStats{
		MaxConns:                stats.MaxConns(),
		TotalConns:              stats.TotalConns(),
		AcquiredConns:           stats.AcquiredConns(),
		IdleConns:               stats.IdleConns(),
		ConstructingConns:       stats.ConstructingConns(),
		AcquireCount:            stats.AcquireCount(),
		AcquireDurationMs:       float64(stats.AcquireDuration().Microseconds()) / 1000,
		CanceledAcquireCount:    stats.CanceledAcquireCount(),
		EmptyAcquireCount:       stats.EmptyAcquireCount(),
		EmptyAcquireWaitTimeMs:  float64(stats.EmptyAcquireWaitTime().Microseconds()) / 1000,
		NewConnsCount:           stats.NewConnsCount(),
		MaxIdleDestroyCount:     stats.MaxIdleDestroyCount(),
		MaxLifetimeDestroyCount: stats.MaxLifetimeDestroyCount(),
	}
}

func (conn poolConn) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return conn.conn.Exec(ctx, sql, args...)
}

func (conn poolConn) Release() {
	conn.conn.Release()
}

func NewConversationRepository(db DB) *ConversationRepository {
	return &ConversationRepository{db: db}
}

func EnsureSchema(ctx context.Context, db ExecDB) error {
	for _, statement := range schemaStatements {
		if _, err := db.Exec(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}

func (r *ConversationRepository) Create(ctx context.Context, conversation domain.Conversation) error {
	var settings any
	if len(conversation.Settings) > 0 {
		settings = conversation.Settings.JSONString()
	}

	acquireStart := time.Now()
	conn, err := r.db.Acquire(ctx)
	recordDBAcquireTiming(ctx, time.Since(acquireStart))
	if err != nil {
		return err
	}
	defer conn.Release()

	insertStart := time.Now()
	_, err = conn.Exec(ctx, `
		INSERT INTO research_conversations
			(id, title, created_at, updated_at, message_count, total_tokens, settings)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
	`,
		conversation.ID,
		conversation.Title,
		conversation.CreatedAt,
		conversation.UpdatedAt,
		conversation.MessageCount,
		conversation.TotalTokens,
		settings,
	)
	recordDBInsertTiming(ctx, time.Since(insertStart))
	return err
}

func recordDBAcquireTiming(ctx context.Context, duration time.Duration) {
	if timing := platform.ConversationTimingFromContext(ctx); timing != nil {
		timing.DBAcquire = duration
	}
}

func recordDBInsertTiming(ctx context.Context, duration time.Duration) {
	if timing := platform.ConversationTimingFromContext(ctx); timing != nil {
		timing.DBInsert = duration
	}
}

var schemaStatements = []string{
	`CREATE TABLE IF NOT EXISTS research_conversations (
		id TEXT PRIMARY KEY,
		title VARCHAR(200) NOT NULL,
		created_at TIMESTAMPTZ NOT NULL,
		updated_at TIMESTAMPTZ NOT NULL,
		message_count INTEGER NOT NULL DEFAULT 0,
		total_tokens INTEGER NOT NULL DEFAULT 0,
		settings JSONB
	)`,
	`CREATE INDEX IF NOT EXISTS ix_research_conversations_updated_at
		ON research_conversations (updated_at)`,
	`CREATE INDEX IF NOT EXISTS ix_research_conversations_title
		ON research_conversations (title)`,
}
