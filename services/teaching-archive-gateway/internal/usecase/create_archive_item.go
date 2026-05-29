package usecase

import (
	"context"
	"fmt"
	"strings"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type ArchiveRepository interface {
	Create(ctx context.Context, item domain.ArchiveItem) error
}

type IDGenerator interface {
	NewID() string
}

type Clock interface {
	Now() time.Time
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
	normalized, _, err := domain.NormalizeCreateArchiveItemInput(input)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	if err := domain.AuthorizeCreateArchiveItem(normalized.Principal, normalized); err != nil {
		return domain.ArchiveItem{}, err
	}

	id := uc.ids.NewID()
	if !strings.HasPrefix(id, "tarch_") {
		return domain.ArchiveItem{}, fmt.Errorf("generated archive item id must use tarch_ prefix")
	}

	item, err := domain.NewArchiveItem(id, normalized, uc.clock.Now())
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	if err := uc.repository.Create(ctx, item); err != nil {
		return domain.ArchiveItem{}, err
	}
	return item, nil
}
