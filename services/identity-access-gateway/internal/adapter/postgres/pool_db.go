package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"ita-refactor/services/identity-access-gateway/internal/platform"
)

type PoolDB struct {
	pool *pgxpool.Pool
}

func NewPoolDB(pool *pgxpool.Pool) PoolDB {
	return PoolDB{pool: pool}
}

func (db PoolDB) Exec(ctx context.Context, sql string, args ...any) (CommandTag, error) {
	return db.pool.Exec(ctx, sql, args...)
}

func (db PoolDB) QueryRow(ctx context.Context, sql string, args ...any) Row {
	return db.pool.QueryRow(ctx, sql, args...)
}

func (db PoolDB) SessionDBPoolStats() platform.SessionDBPoolStats {
	stats := db.pool.Stat()
	return platform.SessionDBPoolStats{
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
