package postgres_test

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"ita-refactor/services/identity-access-gateway/internal/adapter/postgres"
)

func TestEnsureSchemaRetriesConcurrentCreateRace(t *testing.T) {
	db := &schemaRaceDB{
		failures: map[string]int{
			"CREATE UNLOGGED TABLE IF NOT EXISTS identity_sessions": 1,
		},
	}

	err := postgres.EnsureSchemaWithConfig(context.Background(), db, postgres.SchemaConfig{
		SessionTablePersistence: postgres.SessionTablePersistenceUnlogged,
	})
	if err != nil {
		t.Fatalf("EnsureSchemaWithConfig error = %v", err)
	}

	if got := db.calls["CREATE UNLOGGED TABLE IF NOT EXISTS identity_sessions"]; got != 2 {
		t.Fatalf("schema create attempts = %d want 2", got)
	}
	if len(db.execSQL) < 2 {
		t.Fatalf("schema statements were not retried: %#v", db.execSQL)
	}
}

func TestEnsureSchemaDoesNotRetryNonSchemaErrors(t *testing.T) {
	db := &schemaRaceDB{
		failures: map[string]int{
			"CREATE TABLE IF NOT EXISTS identity_sessions": 1,
		},
		errorCode: "XX000",
	}

	err := postgres.EnsureSchema(context.Background(), db)

	if err == nil {
		t.Fatal("EnsureSchema swallowed a non-DDL-race error")
	}
	if got := db.calls["CREATE TABLE IF NOT EXISTS identity_sessions"]; got != 1 {
		t.Fatalf("schema create attempts = %d want 1", got)
	}
}

type schemaRaceDB struct {
	execSQL   []string
	calls     map[string]int
	failures  map[string]int
	errorCode string
}

func (db *schemaRaceDB) Exec(_ context.Context, sql string, _ ...any) (postgres.CommandTag, error) {
	key := schemaStatementKey(sql)
	if db.calls == nil {
		db.calls = map[string]int{}
	}
	db.calls[key]++
	db.execSQL = append(db.execSQL, sql)
	if db.failures[key] > 0 {
		db.failures[key]--
		code := db.errorCode
		if code == "" {
			code = "23505"
		}
		return fakeCommandTag{}, &pgconn.PgError{Code: code, Message: "simulated concurrent schema race"}
	}
	return fakeCommandTag{}, nil
}

func (db *schemaRaceDB) QueryRow(context.Context, string, ...any) postgres.Row {
	return fakeRow{err: pgx.ErrNoRows}
}

func schemaStatementKey(sql string) string {
	compact := strings.Join(strings.Fields(sql), " ")
	for _, prefix := range []string{
		"CREATE UNLOGGED TABLE IF NOT EXISTS identity_sessions",
		"CREATE TABLE IF NOT EXISTS identity_sessions",
	} {
		if strings.HasPrefix(compact, prefix) {
			return prefix
		}
	}
	return compact
}
