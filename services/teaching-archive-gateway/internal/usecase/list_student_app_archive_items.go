package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type ListStudentAppArchiveItems struct {
	reader StudentAppPublishedArchiveMaterialReader
}

type StudentAppPublishedArchiveMaterialReader interface {
	ListPublishedForStudentApp(ctx context.Context, query domain.ArchiveItemQuery) ([]domain.ArchiveItem, error)
}

func NewListStudentAppArchiveItems(reader StudentAppPublishedArchiveMaterialReader) *ListStudentAppArchiveItems {
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
	items, err := uc.reader.ListPublishedForStudentApp(ctx, query)
	if err != nil {
		return domain.ArchiveItemPage{}, err
	}
	return domain.BuildArchiveItemPage(items, query.PageSize)
}
