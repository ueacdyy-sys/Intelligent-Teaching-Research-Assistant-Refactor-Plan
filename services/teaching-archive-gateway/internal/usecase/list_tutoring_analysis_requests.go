package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type TutoringAnalysisRequestReader interface {
	ListTutoringAnalysisRequests(
		ctx context.Context,
		query domain.TutoringAnalysisRequestQuery,
	) ([]domain.TutoringAnalysisRequest, error)
}

type ListTutoringAnalysisRequests struct {
	reader TutoringAnalysisRequestReader
}

func NewListTutoringAnalysisRequests(reader TutoringAnalysisRequestReader) *ListTutoringAnalysisRequests {
	return &ListTutoringAnalysisRequests{reader: reader}
}

func (uc *ListTutoringAnalysisRequests) Execute(
	ctx context.Context,
	input domain.ListTutoringAnalysisRequestsInput,
) (domain.TutoringAnalysisRequestPage, error) {
	query, err := domain.NormalizeListTutoringAnalysisRequestsInput(input)
	if err != nil {
		return domain.TutoringAnalysisRequestPage{}, err
	}
	scopedQuery, err := domain.ScopeListTutoringAnalysisRequests(input.Principal, query)
	if err != nil {
		return domain.TutoringAnalysisRequestPage{}, err
	}
	requests, err := uc.reader.ListTutoringAnalysisRequests(ctx, scopedQuery)
	if err != nil {
		return domain.TutoringAnalysisRequestPage{}, err
	}
	return domain.BuildTutoringAnalysisRequestPage(requests, scopedQuery.PageSize)
}
