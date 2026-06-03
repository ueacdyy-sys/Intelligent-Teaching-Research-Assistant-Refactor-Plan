package postgres

import (
	"context"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"ita-refactor/services/teaching-archive-gateway/internal/platform"
)

type PoolDB struct {
	pool *pgxpool.Pool
}

type poolConn struct {
	conn *pgxpool.Conn
}

type poolRows struct {
	rows pgx.Rows
	conn *pgxpool.Conn
	once sync.Once
}

func NewPoolDB(pool *pgxpool.Pool) PoolDB {
	return PoolDB{pool: pool}
}

func (db PoolDB) TeachingArchiveDBPoolStats() platform.TeachingArchiveDBPoolStats {
	stats := db.pool.Stat()
	return platform.TeachingArchiveDBPoolStats{
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

func (db PoolDB) Exec(ctx context.Context, sql string, args ...any) (CommandTag, error) {
	acquireStart := time.Now()
	conn, err := db.pool.Acquire(ctx)
	recordDBAcquireTiming(ctx, observableDuration(time.Since(acquireStart)))
	if err != nil {
		return nil, err
	}
	defer conn.Release()

	execStart := time.Now()
	tag, err := conn.Exec(ctx, sql, args...)
	recordDBExecTiming(ctx, observableDuration(time.Since(execStart)))
	return tag, err
}

func (db PoolDB) Query(ctx context.Context, sql string, args ...any) (Rows, error) {
	acquireStart := time.Now()
	conn, err := db.pool.Acquire(ctx)
	recordDBAcquireTiming(ctx, observableDuration(time.Since(acquireStart)))
	if err != nil {
		return nil, err
	}

	rows, err := conn.Query(ctx, sql, args...)
	if err != nil {
		conn.Release()
		return nil, err
	}
	return &poolRows{rows: rows, conn: conn}, nil
}

func (db PoolDB) Acquire(ctx context.Context) (Conn, error) {
	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	return poolConn{conn: conn}, nil
}

func (conn poolConn) Exec(ctx context.Context, sql string, args ...any) (CommandTag, error) {
	return conn.conn.Exec(ctx, sql, args...)
}

func (conn poolConn) Release() {
	conn.conn.Release()
}

func (rows *poolRows) Close() {
	rows.once.Do(func() {
		rows.rows.Close()
		rows.conn.Release()
	})
}

func (rows *poolRows) Next() bool {
	return rows.rows.Next()
}

func (rows *poolRows) Scan(dest ...any) error {
	return rows.rows.Scan(dest...)
}

func (rows *poolRows) Err() error {
	return rows.rows.Err()
}

func (db PoolDB) Begin(ctx context.Context) (Tx, error) {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	return poolTx{tx: tx}, nil
}

type poolTx struct {
	tx pgx.Tx
}

func (tx poolTx) Exec(ctx context.Context, sql string, args ...any) (CommandTag, error) {
	execStart := time.Now()
	tag, err := tx.tx.Exec(ctx, sql, args...)
	recordDBExecTiming(ctx, observableDuration(time.Since(execStart)))
	return tag, err
}

func (tx poolTx) Query(ctx context.Context, sql string, args ...any) (Rows, error) {
	return tx.tx.Query(ctx, sql, args...)
}

func (tx poolTx) Commit(ctx context.Context) error {
	return tx.tx.Commit(ctx)
}

func (tx poolTx) Rollback(ctx context.Context) error {
	return tx.tx.Rollback(ctx)
}

func recordDBAcquireTiming(ctx context.Context, duration time.Duration) {
	if timing := platform.TeachingArchiveTimingFromContext(ctx); timing != nil {
		timing.DBAcquire = duration
	}
}

func recordDBBatchWaitTiming(ctx context.Context, duration time.Duration) {
	if timing := platform.TeachingArchiveTimingFromContext(ctx); timing != nil {
		timing.DBBatchWait = duration
	}
}

func recordDBExecTiming(ctx context.Context, duration time.Duration) {
	if timing := platform.TeachingArchiveTimingFromContext(ctx); timing != nil {
		timing.DBExec = duration
	}
}
