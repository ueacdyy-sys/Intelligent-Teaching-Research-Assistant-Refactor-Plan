package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type StudentAppPublishedArchiveMaterialDetailReader interface {
	GetPublishedForStudentApp(
		ctx context.Context,
		archiveItemID string,
		studentID string,
	) (domain.ArchiveItem, bool, error)
}

type ReadStudentAppArchiveItem struct {
	reader StudentAppPublishedArchiveMaterialDetailReader
}

func NewReadStudentAppArchiveItem(
	reader StudentAppPublishedArchiveMaterialDetailReader,
) *ReadStudentAppArchiveItem {
	return &ReadStudentAppArchiveItem{reader: reader}
}

func (uc *ReadStudentAppArchiveItem) Execute(
	ctx context.Context,
	input domain.ReadStudentAppArchiveItemInput,
) (domain.ArchiveItem, error) {
	normalized, err := domain.NormalizeReadStudentAppArchiveItemInput(input)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	item, ok, err := uc.reader.GetPublishedForStudentApp(
		ctx,
		normalized.ArchiveItemID,
		normalized.StudentID,
	)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	if !ok {
		return domain.ArchiveItem{}, domain.ErrNotFound
	}
	return domain.BuildStudentAppArchiveItemMetadata(normalized, item)
}
