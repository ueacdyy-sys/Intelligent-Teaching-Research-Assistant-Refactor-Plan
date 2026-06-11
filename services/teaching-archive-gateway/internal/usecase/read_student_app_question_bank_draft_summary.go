package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type StudentAppQuestionBankDraftSummaryReader interface {
	CountQuestionBankDraftsBySourceMaterial(
		ctx context.Context,
		query domain.TutoringAnalysisRequestQuery,
	) (map[domain.MaterialType]int, error)
}

type ReadStudentAppQuestionBankDraftSummary struct {
	reader StudentAppQuestionBankDraftSummaryReader
}

func NewReadStudentAppQuestionBankDraftSummary(
	reader StudentAppQuestionBankDraftSummaryReader,
) *ReadStudentAppQuestionBankDraftSummary {
	return &ReadStudentAppQuestionBankDraftSummary{reader: reader}
}

func (uc *ReadStudentAppQuestionBankDraftSummary) Execute(
	ctx context.Context,
	input domain.ReadStudentAppQuestionBankDraftSummaryInput,
) (domain.StudentAppQuestionBankDraftSummary, error) {
	query, err := domain.NormalizeReadStudentAppQuestionBankDraftSummaryInput(input)
	if err != nil {
		return domain.StudentAppQuestionBankDraftSummary{}, err
	}
	counts, err := uc.reader.CountQuestionBankDraftsBySourceMaterial(ctx, query)
	if err != nil {
		return domain.StudentAppQuestionBankDraftSummary{}, err
	}
	return domain.BuildStudentAppQuestionBankDraftSummary(counts)
}
