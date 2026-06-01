package postgres_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"ita-refactor/services/conversation-write-gateway/internal/adapter/postgres"
	"ita-refactor/services/conversation-write-gateway/internal/domain"
	"ita-refactor/services/conversation-write-gateway/internal/platform"
)

func TestEnsureSchemaCreatesConversationTableAndIndexes(t *testing.T) {
	db := &fakeDB{}

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema() error = %v", err)
	}

	joined := strings.Join(db.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS research_conversations",
		"settings JSONB",
		"CREATE INDEX IF NOT EXISTS ix_research_conversations_updated_at",
	} {
		if !strings.Contains(joined, fragment) {
			t.Fatalf("schema statements missing %q in:\n%s", fragment, joined)
		}
	}
	if strings.Contains(joined, "ix_research_conversations_title") {
		t.Fatalf("fresh write schema should defer title index creation:\n%s", joined)
	}
}

func TestEnsureSchemaUsesSingleConnectionAdvisoryLock(t *testing.T) {
	db := &fakeDB{}

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema() error = %v", err)
	}

	if db.acquireCount != 1 {
		t.Fatalf("Acquire count = %d want 1", db.acquireCount)
	}
	if db.releaseCount != 1 {
		t.Fatalf("Release count = %d want 1", db.releaseCount)
	}
	if got := db.statements[0]; got != "BEGIN" {
		t.Fatalf("first statement = %q want BEGIN", got)
	}
	if got := db.statements[1]; !strings.Contains(got, "pg_advisory_xact_lock") {
		t.Fatalf("second statement = %q want transaction advisory lock", got)
	}
	if got := db.statements[len(db.statements)-1]; got != "COMMIT" {
		t.Fatalf("last statement = %q want COMMIT", got)
	}
}

func TestEnsureSchemaRollsBackOnSchemaError(t *testing.T) {
	db := &fakeDB{
		failOnStatement: "CREATE TABLE IF NOT EXISTS research_conversations",
		failErr:         errors.New("ddl failed"),
	}

	err := postgres.EnsureSchema(context.Background(), db)
	if err == nil {
		t.Fatal("EnsureSchema() error = nil, want DDL error")
	}
	if !errors.Is(err, db.failErr) {
		t.Fatalf("EnsureSchema() error = %v want %v", err, db.failErr)
	}
	if db.releaseCount != 1 {
		t.Fatalf("Release count = %d want 1", db.releaseCount)
	}
	if got := db.statements[len(db.statements)-1]; got != "ROLLBACK" {
		t.Fatalf("last statement = %q want ROLLBACK", got)
	}
}

func TestRepositoryCreateUsesExecutorPortAndJSONBSettings(t *testing.T) {
	db := &fakeDB{}
	repository := postgres.NewConversationRepository(db)
	createdAt := time.Date(2026, 5, 31, 8, 0, 0, 0, time.UTC)
	rawSettings := `{"fusionMode":"balanced","nested":{"strategy":"fast"}}`

	err := repository.Create(context.Background(), domain.Conversation{
		ID:           "conv_test",
		Title:        "Research",
		CreatedAt:    createdAt,
		UpdatedAt:    createdAt,
		MessageCount: 0,
		TotalTokens:  0,
		Settings:     domain.NewSettingsJSON([]byte(rawSettings)),
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if len(db.statements) != 1 {
		t.Fatalf("statements = %d want 1", len(db.statements))
	}
	if !strings.Contains(db.statements[0], "$7::jsonb") {
		t.Fatalf("insert should cast settings as jsonb: %s", db.statements[0])
	}
	if got := db.args[6]; got != rawSettings {
		t.Fatalf("settings arg = %#v", got)
	}
}

func TestRepositoryCreateRecordsDatabaseTimings(t *testing.T) {
	db := &fakeDB{acquireDelay: time.Millisecond, execDelay: time.Millisecond}
	repository := postgres.NewConversationRepository(db)
	timing := &platform.ConversationTiming{}
	ctx := platform.WithConversationTiming(context.Background(), timing)
	createdAt := time.Date(2026, 5, 31, 8, 0, 0, 0, time.UTC)

	err := repository.Create(ctx, domain.Conversation{
		ID:        "conv_test",
		Title:     "Research",
		CreatedAt: createdAt,
		UpdatedAt: createdAt,
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if timing.DBAcquire <= 0 {
		t.Fatalf("DBAcquire = %s want > 0", timing.DBAcquire)
	}
	if timing.DBInsert <= 0 {
		t.Fatalf("DBInsert = %s want > 0", timing.DBInsert)
	}
}

type fakeDB struct {
	statements      []string
	args            []any
	acquireCount    int
	releaseCount    int
	acquireDelay    time.Duration
	execDelay       time.Duration
	failOnStatement string
	failErr         error
}

func (f *fakeDB) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	f.statements = append(f.statements, sql)
	f.args = args
	if f.failOnStatement != "" && strings.Contains(sql, f.failOnStatement) {
		return pgconn.CommandTag{}, f.failErr
	}
	return pgconn.CommandTag{}, nil
}

func (f *fakeDB) Acquire(context.Context) (postgres.Conn, error) {
	f.acquireCount++
	if f.acquireDelay > 0 {
		time.Sleep(f.acquireDelay)
	}
	return fakeConn{db: f}, nil
}

type fakeConn struct {
	db *fakeDB
}

func (f fakeConn) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if f.db.execDelay > 0 {
		time.Sleep(f.db.execDelay)
	}
	return f.db.Exec(ctx, sql, args...)
}

func (f fakeConn) Release() {
	f.db.releaseCount++
}
