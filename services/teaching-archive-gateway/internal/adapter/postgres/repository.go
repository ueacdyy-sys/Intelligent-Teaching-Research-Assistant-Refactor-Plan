package postgres

import "context"

type CommandTag interface {
	RowsAffected() int64
}

type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (Rows, error)
}

type Rows interface {
	Close()
	Next() bool
	Scan(dest ...any) error
	Err() error
}

type ArchiveRepository struct {
	db DB
}

func NewArchiveRepository(db DB) *ArchiveRepository {
	return &ArchiveRepository{db: db}
}
