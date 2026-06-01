package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgconn"

	"ita-refactor/services/conversation-write-gateway/internal/domain"
)

type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

type ConversationRepository struct {
	db DB
}

func NewConversationRepository(db DB) *ConversationRepository {
	return &ConversationRepository{db: db}
}

func EnsureSchema(ctx context.Context, db DB) error {
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

	_, err := r.db.Exec(ctx, `
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
	return err
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
