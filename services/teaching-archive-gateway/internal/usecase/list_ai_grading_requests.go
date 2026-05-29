package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type AIGradingRequestReader interface {
	ListAIGradingRequests(
		ctx context.Context,
		query domain.AIGradingRequestQuery,
	) ([]domain.AIGradingRequest, error)
}

type ListAIGradingRequests struct {
	reader AIGradingRequestReader
}

func NewListAIGradingRequests(reader AIGradingRequestReader) *ListAIGradingRequests {
	return &ListAIGradingRequests{reader: reader}
}

func (uc *ListAIGradingRequests) Execute(
	ctx context.Context,
	input domain.ListAIGradingRequestsInput,
) (domain.AIGradingRequestPage, error) {
	query, err := domain.NormalizeListAIGradingRequestsInput(input)
	if err != nil {
		return domain.AIGradingRequestPage{}, err
	}
	scopedQuery, err := domain.ScopeListAIGradingRequests(input.Principal, query)
	if err != nil {
		return domain.AIGradingRequestPage{}, err
	}
	requests, err := uc.reader.ListAIGradingRequests(ctx, scopedQuery)
	if err != nil {
		return domain.AIGradingRequestPage{}, err
	}
	return domain.BuildAIGradingRequestPage(requests, scopedQuery.PageSize)
}
