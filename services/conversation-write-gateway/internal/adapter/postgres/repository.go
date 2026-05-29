package postgres

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"

	"ita-refactor/services/conversation-write-gateway/internal/domain"
)

type ConversationRepository struct {
	pool *pgxpool.Pool
}

func NewConversationRepository(pool *pgxpool.Pool) *ConversationRepository {
	return &ConversationRepository{pool: pool}
}

func (r *ConversationRepository) Create(ctx context.Context, conversation domain.Conversation) error {
	var settings any
	if conversation.Settings != nil {
		payload, err := json.Marshal(conversation.Settings)
		if err != nil {
			return err
		}
		settings = payload
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO research_conversations
			(id, title, created_at, updated_at, message_count, total_tokens, settings)
		VALUES ($1, $2, $3, $4, $5, $6, $7::json)
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
