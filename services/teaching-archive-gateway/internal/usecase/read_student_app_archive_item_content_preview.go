package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type StudentAppArchiveItemContentPreviewReader interface {
	GetPublishedContentPreviewForStudentApp(
		ctx context.Context,
		archiveItemID string,
		studentID string,
	) (domain.PublishedArchiveMaterialContentPreview, bool, error)
}

type ReadStudentAppArchiveItemContentPreview struct {
	reader StudentAppArchiveItemContentPreviewReader
}

func NewReadStudentAppArchiveItemContentPreview(
	reader StudentAppArchiveItemContentPreviewReader,
) *ReadStudentAppArchiveItemContentPreview {
	return &ReadStudentAppArchiveItemContentPreview{reader: reader}
}

func (uc *ReadStudentAppArchiveItemContentPreview) Execute(
	ctx context.Context,
	input domain.ReadStudentAppArchiveItemContentPreviewInput,
) (domain.PublishedArchiveMaterialContentPreview, error) {
	normalized, err := domain.NormalizeReadStudentAppArchiveItemContentPreviewInput(input)
	if err != nil {
		return domain.PublishedArchiveMaterialContentPreview{}, err
	}
	preview, ok, err := uc.reader.GetPublishedContentPreviewForStudentApp(
		ctx,
		normalized.ArchiveItemID,
		normalized.StudentID,
	)
	if err != nil {
		return domain.PublishedArchiveMaterialContentPreview{}, err
	}
	if !ok {
		return domain.PublishedArchiveMaterialContentPreview{}, domain.ErrNotFound
	}
	return domain.BuildStudentAppArchiveItemContentPreview(normalized, preview)
}
