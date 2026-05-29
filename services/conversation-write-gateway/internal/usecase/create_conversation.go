package usecase

import (
	"context"
	"fmt"
	"strings"
	"time"

	"ita-refactor/services/conversation-write-gateway/internal/domain"
)

type ConversationRepository interface {
	Create(ctx context.Context, conversation domain.Conversation) error
}

type EventPublisher interface {
	ConversationCreated(ctx context.Context, conversation domain.Conversation) error
}

type IDGenerator interface {
	NewID() string
}

type Clock interface {
	Now() time.Time
}

type CreateConversation struct {
	repository ConversationRepository
	events     EventPublisher
	ids        IDGenerator
	clock      Clock
}

func NewCreateConversation(
	repository ConversationRepository,
	events EventPublisher,
	ids IDGenerator,
	clock Clock,
) *CreateConversation {
	return &CreateConversation{
		repository: repository,
		events:     events,
		ids:        ids,
		clock:      clock,
	}
}

func (uc *CreateConversation) Execute(
	ctx context.Context,
	input domain.CreateConversationInput,
) (domain.Conversation, error) {
	title, err := domain.NormalizeTitle(input.Title)
	if err != nil {
		return domain.Conversation{}, err
	}

	id := uc.ids.NewID()
	if !strings.HasPrefix(id, "conv_") {
		return domain.Conversation{}, fmt.Errorf("generated conversation id must use conv_ prefix")
	}

	now := uc.clock.Now().UTC()
	conversation := domain.Conversation{
		ID:           id,
		Title:        title,
		CreatedAt:    now,
		UpdatedAt:    now,
		MessageCount: 0,
		TotalTokens:  0,
		Settings:     input.Settings,
	}

	if err := uc.repository.Create(ctx, conversation); err != nil {
		return domain.Conversation{}, err
	}
	if uc.events != nil {
		if err := uc.events.ConversationCreated(ctx, conversation); err != nil {
			return domain.Conversation{}, err
		}
	}
	return conversation, nil
}
