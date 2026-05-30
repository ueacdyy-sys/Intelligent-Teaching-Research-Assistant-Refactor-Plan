package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type ListStudentAppQuestionBankDrafts struct {
	reader TutoringAnalysisRequestReader
}

func NewListStudentAppQuestionBankDrafts(reader TutoringAnalysisRequestReader) *ListStudentAppQuestionBankDrafts {
	return &ListStudentAppQuestionBankDrafts{reader: reader}
}

func (uc *ListStudentAppQuestionBankDrafts) Execute(
	ctx context.Context,
	input domain.ListStudentAppQuestionBankDraftsInput,
) (domain.StudentAppQuestionBankDraftPage, error) {
	query, err := domain.NormalizeListStudentAppQuestionBankDraftsInput(input)
	if err != nil {
		return domain.StudentAppQuestionBankDraftPage{}, err
	}
	requests, err := uc.reader.ListTutoringAnalysisRequests(ctx, query)
	if err != nil {
		return domain.StudentAppQuestionBankDraftPage{}, err
	}
	return domain.BuildStudentAppQuestionBankDraftPage(requests, query.PageSize)
}
