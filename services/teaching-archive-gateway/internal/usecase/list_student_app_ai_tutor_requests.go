package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type ListStudentAppAITutorRequests struct {
	reader TutoringAnalysisRequestReader
}

func NewListStudentAppAITutorRequests(reader TutoringAnalysisRequestReader) *ListStudentAppAITutorRequests {
	return &ListStudentAppAITutorRequests{reader: reader}
}

func (uc *ListStudentAppAITutorRequests) Execute(
	ctx context.Context,
	input domain.ListStudentAppAITutorRequestsInput,
) (domain.TutoringAnalysisRequestPage, error) {
	query, err := domain.NormalizeListStudentAppAITutorRequestsInput(input)
	if err != nil {
		return domain.TutoringAnalysisRequestPage{}, err
	}
	requests, err := uc.reader.ListTutoringAnalysisRequests(ctx, query)
	if err != nil {
		return domain.TutoringAnalysisRequestPage{}, err
	}
	return domain.BuildTutoringAnalysisRequestPage(requests, query.PageSize)
}
