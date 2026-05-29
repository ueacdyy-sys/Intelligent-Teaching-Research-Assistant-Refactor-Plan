package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type ArchiveReader interface {
	List(ctx context.Context, query domain.ArchiveItemQuery) ([]domain.ArchiveItem, error)
}

type ListArchiveItems struct {
	reader ArchiveReader
}

func NewListArchiveItems(reader ArchiveReader) *ListArchiveItems {
	return &ListArchiveItems{reader: reader}
}

func (uc *ListArchiveItems) Execute(
	ctx context.Context,
	input domain.ListArchiveItemsInput,
) (domain.ArchiveItemPage, error) {
	query, err := domain.NormalizeListArchiveItemsInput(input)
	if err != nil {
		return domain.ArchiveItemPage{}, err
	}
	scopedQuery, err := domain.ScopeListArchiveItems(input.Principal, query)
	if err != nil {
		return domain.ArchiveItemPage{}, err
	}
	items, err := uc.reader.List(ctx, scopedQuery)
	if err != nil {
		return domain.ArchiveItemPage{}, err
	}
	return domain.BuildArchiveItemPage(items, scopedQuery.PageSize)
}
