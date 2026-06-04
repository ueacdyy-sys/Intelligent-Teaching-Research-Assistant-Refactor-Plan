package usecase

import (
	"context"
	"fmt"
	"strings"
	"time"

	"ita-refactor/services/conversation-write-gateway/internal/domain"
)

type ConversationRepository interface {
	Create(ctx context.Context, conversation domain.Conversation) (CreatePersistenceOutcome, error)
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

type CreatePersistenceStatus string

const (
	PersistenceStatusPersisted CreatePersistenceStatus = "persisted"
	PersistenceStatusAccepted  CreatePersistenceStatus = "accepted"
)

type CreatePersistenceOutcome struct {
	Status    CreatePersistenceStatus
	CommandID string
}

type CreateConversationResult struct {
	Conversation domain.Conversation
	Persistence  CreatePersistenceOutcome
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
) (CreateConversationResult, error) {
	title, err := domain.NormalizeTitle(input.Title)
	if err != nil {
		return CreateConversationResult{}, err
	}

	id := uc.ids.NewID()
	if !strings.HasPrefix(id, "conv_") {
		return CreateConversationResult{}, fmt.Errorf("generated conversation id must use conv_ prefix")
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

	persistence, err := uc.repository.Create(ctx, conversation)
	if err != nil {
		return CreateConversationResult{}, err
	}
	persistence = normalizePersistenceOutcome(persistence)
	if uc.events != nil && persistence.Status == PersistenceStatusPersisted {
		if err := uc.events.ConversationCreated(ctx, conversation); err != nil {
			return CreateConversationResult{}, err
		}
	}
	return CreateConversationResult{
		Conversation: conversation,
		Persistence:  persistence,
	}, nil
}

func PersistedOutcome() CreatePersistenceOutcome {
	return CreatePersistenceOutcome{Status: PersistenceStatusPersisted}
}

func AcceptedOutcome(commandID string) CreatePersistenceOutcome {
	return CreatePersistenceOutcome{Status: PersistenceStatusAccepted, CommandID: commandID}
}

func normalizePersistenceOutcome(outcome CreatePersistenceOutcome) CreatePersistenceOutcome {
	if outcome.Status == "" {
		outcome.Status = PersistenceStatusPersisted
	}
	return outcome
}
