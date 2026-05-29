package event

import (
	"context"

	"ita-refactor/services/conversation-write-gateway/internal/domain"
)

type NoopPublisher struct{}

func (NoopPublisher) ConversationCreated(context.Context, domain.Conversation) error {
	return nil
}
