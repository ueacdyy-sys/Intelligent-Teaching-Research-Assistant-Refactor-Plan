package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type StudentAppAITutorRequestProgressSummaryReader interface {
	CountTutoringAnalysisRequestsByStatus(
		ctx context.Context,
		query domain.TutoringAnalysisRequestQuery,
	) (map[domain.TutoringAnalysisStatus]int, error)
}

type ReadStudentAppAITutorRequestProgressSummary struct {
	reader StudentAppAITutorRequestProgressSummaryReader
}

func NewReadStudentAppAITutorRequestProgressSummary(
	reader StudentAppAITutorRequestProgressSummaryReader,
) *ReadStudentAppAITutorRequestProgressSummary {
	return &ReadStudentAppAITutorRequestProgressSummary{reader: reader}
}

func (uc *ReadStudentAppAITutorRequestProgressSummary) Execute(
	ctx context.Context,
	input domain.ReadStudentAppAITutorRequestProgressSummaryInput,
) (domain.StudentAppAITutorRequestProgressSummary, error) {
	query, err := domain.NormalizeReadStudentAppAITutorRequestProgressSummaryInput(input)
	if err != nil {
		return domain.StudentAppAITutorRequestProgressSummary{}, err
	}
	statusCounts, err := uc.reader.CountTutoringAnalysisRequestsByStatus(ctx, query)
	if err != nil {
		return domain.StudentAppAITutorRequestProgressSummary{}, err
	}
	return domain.BuildStudentAppAITutorRequestProgressSummary(statusCounts)
}
