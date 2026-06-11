package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type StudentAppPublishedArchiveMaterialSummaryReader interface {
	CountPublishedArchiveMaterialsByType(
		ctx context.Context,
		query domain.ArchiveItemQuery,
	) (map[domain.MaterialType]int, error)
}

type ReadStudentAppArchiveItemSearchSummary struct {
	reader StudentAppPublishedArchiveMaterialSummaryReader
}

func NewReadStudentAppArchiveItemSearchSummary(
	reader StudentAppPublishedArchiveMaterialSummaryReader,
) *ReadStudentAppArchiveItemSearchSummary {
	return &ReadStudentAppArchiveItemSearchSummary{reader: reader}
}

func (uc *ReadStudentAppArchiveItemSearchSummary) Execute(
	ctx context.Context,
	input domain.ReadStudentAppArchiveItemSearchSummaryInput,
) (domain.StudentAppArchiveItemSearchSummary, error) {
	query, err := domain.NormalizeReadStudentAppArchiveItemSearchSummaryInput(input)
	if err != nil {
		return domain.StudentAppArchiveItemSearchSummary{}, err
	}
	counts, err := uc.reader.CountPublishedArchiveMaterialsByType(ctx, query)
	if err != nil {
		return domain.StudentAppArchiveItemSearchSummary{}, err
	}
	return domain.BuildStudentAppArchiveItemSearchSummary(counts)
}
