package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type RenderStudentAppArchiveItemContentPreview struct {
	reader StudentAppArchiveItemContentPreviewReader
}

func NewRenderStudentAppArchiveItemContentPreview(
	reader StudentAppArchiveItemContentPreviewReader,
) *RenderStudentAppArchiveItemContentPreview {
	return &RenderStudentAppArchiveItemContentPreview{reader: reader}
}

func (uc *RenderStudentAppArchiveItemContentPreview) Execute(
	ctx context.Context,
	input domain.ReadStudentAppArchiveItemContentPreviewInput,
) (domain.PublishedArchiveMaterialContentPreviewRenderEnvelope, error) {
	normalized, err := domain.NormalizeReadStudentAppArchiveItemContentPreviewInput(input)
	if err != nil {
		return domain.PublishedArchiveMaterialContentPreviewRenderEnvelope{}, err
	}
	preview, ok, err := uc.reader.GetPublishedContentPreviewForStudentApp(
		ctx,
		normalized.ArchiveItemID,
		normalized.StudentID,
	)
	if err != nil {
		return domain.PublishedArchiveMaterialContentPreviewRenderEnvelope{}, err
	}
	if !ok {
		return domain.PublishedArchiveMaterialContentPreviewRenderEnvelope{}, domain.ErrNotFound
	}
	return domain.BuildStudentAppArchiveItemContentPreviewRenderEnvelope(normalized, preview)
}
