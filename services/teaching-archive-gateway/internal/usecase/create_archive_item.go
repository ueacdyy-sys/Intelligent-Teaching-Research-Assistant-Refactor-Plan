package usecase

import (
	"context"
	"fmt"
	"strings"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type ArchiveRepository interface {
	Create(ctx context.Context, item domain.ArchiveItem) (WritePersistenceOutcome, error)
}

type IDGenerator interface {
	NewID() string
}

type Clock interface {
	Now() time.Time
}

type WritePersistenceStatus string

const (
	PersistenceStatusPersisted WritePersistenceStatus = "persisted"
	PersistenceStatusAccepted  WritePersistenceStatus = "accepted"
)

type WritePersistenceOutcome struct {
	Status    WritePersistenceStatus
	CommandID string
}

type CreateArchiveItemResult struct {
	Item        domain.ArchiveItem
	Persistence WritePersistenceOutcome
}

type CreateArchiveItem struct {
	repository ArchiveRepository
	ids        IDGenerator
	clock      Clock
}

func NewCreateArchiveItem(repository ArchiveRepository, ids IDGenerator, clock Clock) *CreateArchiveItem {
	return &CreateArchiveItem{
		repository: repository,
		ids:        ids,
		clock:      clock,
	}
}

func (uc *CreateArchiveItem) Execute(
	ctx context.Context,
	input domain.CreateArchiveItemInput,
) (domain.ArchiveItem, error) {
	result, err := uc.ExecuteWithPersistence(ctx, input)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	return result.Item, nil
}

func (uc *CreateArchiveItem) ExecuteWithPersistence(
	ctx context.Context,
	input domain.CreateArchiveItemInput,
) (CreateArchiveItemResult, error) {
	normalized, _, err := domain.NormalizeCreateArchiveItemInput(input)
	if err != nil {
		return CreateArchiveItemResult{}, err
	}
	if err := domain.AuthorizeCreateArchiveItem(normalized.Principal, normalized); err != nil {
		return CreateArchiveItemResult{}, err
	}

	id := uc.ids.NewID()
	if !strings.HasPrefix(id, "tarch_") {
		return CreateArchiveItemResult{}, fmt.Errorf("generated archive item id must use tarch_ prefix")
	}

	item, err := domain.NewArchiveItem(id, normalized, uc.clock.Now())
	if err != nil {
		return CreateArchiveItemResult{}, err
	}
	persistence, err := uc.repository.Create(ctx, item)
	if err != nil {
		return CreateArchiveItemResult{}, err
	}
	return CreateArchiveItemResult{
		Item:        item,
		Persistence: normalizeWritePersistenceOutcome(persistence),
	}, nil
}

func PersistedWriteOutcome() WritePersistenceOutcome {
	return WritePersistenceOutcome{Status: PersistenceStatusPersisted}
}

func AcceptedWriteOutcome(commandID string) WritePersistenceOutcome {
	return WritePersistenceOutcome{Status: PersistenceStatusAccepted, CommandID: commandID}
}

func normalizeWritePersistenceOutcome(outcome WritePersistenceOutcome) WritePersistenceOutcome {
	if outcome.Status == "" {
		outcome.Status = PersistenceStatusPersisted
	}
	return outcome
}
