package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type ListStudentAppArchiveItems struct {
	reader ArchiveReader
}

func NewListStudentAppArchiveItems(reader ArchiveReader) *ListStudentAppArchiveItems {
	return &ListStudentAppArchiveItems{reader: reader}
}

func (uc *ListStudentAppArchiveItems) Execute(
	ctx context.Context,
	input domain.ListStudentAppArchiveItemsInput,
) (domain.ArchiveItemPage, error) {
	query, err := domain.NormalizeListStudentAppArchiveItemsInput(input)
	if err != nil {
		return domain.ArchiveItemPage{}, err
	}
	items, err := uc.reader.List(ctx, query)
	if err != nil {
		return domain.ArchiveItemPage{}, err
	}
	return domain.BuildArchiveItemPage(items, query.PageSize)
}
