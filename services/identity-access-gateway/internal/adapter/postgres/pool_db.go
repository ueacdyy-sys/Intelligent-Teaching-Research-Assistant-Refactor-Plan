package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"ita-refactor/services/identity-access-gateway/internal/platform"
)

type PoolDB struct {
	pool *pgxpool.Pool
}

type SessionDBStatsProvider struct {
	poolStatsProvider            platform.SessionDBPoolStatsProvider
	writeLimiterStatsProvider    platform.SessionWriteLimiterStatsProvider
	operationTimingStatsProvider platform.SessionOperationTimingStatsProvider
}

func NewPoolDB(pool *pgxpool.Pool) PoolDB {
	return PoolDB{pool: pool}
}

func NewSessionDBStatsProvider(
	poolStatsProvider platform.SessionDBPoolStatsProvider,
	writeLimiterStatsProvider platform.SessionWriteLimiterStatsProvider,
	operationTimingStatsProviders ...platform.SessionOperationTimingStatsProvider,
) SessionDBStatsProvider {
	var operationTimingStatsProvider platform.SessionOperationTimingStatsProvider
	if len(operationTimingStatsProviders) > 0 {
		operationTimingStatsProvider = operationTimingStatsProviders[0]
	} else if provider, ok := writeLimiterStatsProvider.(platform.SessionOperationTimingStatsProvider); ok {
		operationTimingStatsProvider = provider
	}
	return SessionDBStatsProvider{
		poolStatsProvider:            poolStatsProvider,
		writeLimiterStatsProvider:    writeLimiterStatsProvider,
		operationTimingStatsProvider: operationTimingStatsProvider,
	}
}

func (db PoolDB) Exec(ctx context.Context, sql string, args ...any) (CommandTag, error) {
	return db.pool.Exec(ctx, sql, args...)
}

func (db PoolDB) ExecMeasured(ctx context.Context, sql string, args ...any) (CommandTag, DBOperationMeasurement, error) {
	acquireStartedAt := time.Now()
	conn, err := db.pool.Acquire(ctx)
	measurement := DBOperationMeasurement{
		PoolAcquireElapsed:  time.Since(acquireStartedAt),
		PoolAcquireMeasured: true,
	}
	if err != nil {
		return nil, measurement, err
	}
	defer conn.Release()

	execStartedAt := time.Now()
	tag, err := conn.Exec(ctx, sql, args...)
	measurement.DBExecuteElapsed = time.Since(execStartedAt)
	measurement.DBExecuteMeasured = true
	return tag, measurement, err
}

func (db PoolDB) QueryRow(ctx context.Context, sql string, args ...any) Row {
	return db.pool.QueryRow(ctx, sql, args...)
}

func (db PoolDB) QueryRowMeasured(ctx context.Context, sql string, args ...any) MeasuredQueryRow {
	return measuredPoolRow{
		pool: db.pool,
		ctx:  ctx,
		sql:  sql,
		args: append([]any(nil), args...),
	}
}

type measuredPoolRow struct {
	pool *pgxpool.Pool
	ctx  context.Context
	sql  string
	args []any
}

func (row measuredPoolRow) ScanMeasured(dest ...any) (DBOperationMeasurement, error) {
	acquireStartedAt := time.Now()
	conn, err := row.pool.Acquire(row.ctx)
	measurement := DBOperationMeasurement{
		PoolAcquireElapsed:  time.Since(acquireStartedAt),
		PoolAcquireMeasured: true,
	}
	if err != nil {
		return measurement, err
	}
	defer conn.Release()

	execStartedAt := time.Now()
	err = conn.QueryRow(row.ctx, row.sql, row.args...).Scan(dest...)
	measurement.DBExecuteElapsed = time.Since(execStartedAt)
	measurement.DBExecuteMeasured = true
	return measurement, err
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

func (provider SessionDBStatsProvider) SessionDBPoolStats() platform.SessionDBPoolStats {
	stats := provider.poolStatsProvider.SessionDBPoolStats()
	if provider.writeLimiterStatsProvider != nil {
		stats.WriteLimiter = provider.writeLimiterStatsProvider.SessionWriteLimiterStats()
	}
	if provider.operationTimingStatsProvider != nil {
		stats.SessionOperations = provider.operationTimingStatsProvider.SessionOperationTimingStats()
	}
	return stats
}
