package postgres_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"ita-refactor/services/conversation-write-gateway/internal/adapter/postgres"
	"ita-refactor/services/conversation-write-gateway/internal/domain"
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
		"CREATE INDEX IF NOT EXISTS ix_research_conversations_title",
	} {
		if !strings.Contains(joined, fragment) {
			t.Fatalf("schema statements missing %q in:\n%s", fragment, joined)
		}
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

type fakeDB struct {
	statements []string
	args       []any
}

func (f *fakeDB) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	f.statements = append(f.statements, sql)
	f.args = args
	return pgconn.CommandTag{}, nil
}
