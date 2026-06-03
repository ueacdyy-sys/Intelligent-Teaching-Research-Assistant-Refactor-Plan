package postgres

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
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

func (db PoolDB) Query(ctx context.Context, sql string, args ...any) (Rows, error) {
	return db.pool.Query(ctx, sql, args...)
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
	return tx.tx.Exec(ctx, sql, args...)
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
