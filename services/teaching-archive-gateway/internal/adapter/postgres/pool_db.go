package postgres

import (
	"context"

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
