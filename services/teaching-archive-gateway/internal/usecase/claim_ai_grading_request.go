package usecase

import (
	"context"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type AIGradingClaimRepository interface {
	ClaimNextAIGradingRequest(
		ctx context.Context,
		input domain.ClaimAIGradingRequestInput,
		now time.Time,
	) (domain.AIGradingRequest, bool, error)
}

type ClaimAIGradingRequest struct {
	repository AIGradingClaimRepository
	clock      Clock
}

func NewClaimAIGradingRequest(
	repository AIGradingClaimRepository,
	clock Clock,
) *ClaimAIGradingRequest {
	return &ClaimAIGradingRequest{
		repository: repository,
		clock:      clock,
	}
}

func (uc *ClaimAIGradingRequest) Execute(
	ctx context.Context,
	input domain.ClaimAIGradingRequestInput,
) (domain.AIGradingRequest, bool, error) {
	if err := domain.AuthorizeClaimAIGradingRequest(input.Principal); err != nil {
		return domain.AIGradingRequest{}, false, err
	}
	normalized, err := domain.NormalizeClaimAIGradingRequestInput(input)
	if err != nil {
		return domain.AIGradingRequest{}, false, err
	}
	request, ok, err := uc.repository.ClaimNextAIGradingRequest(ctx, normalized, uc.clock.Now())
	if err != nil {
		return domain.AIGradingRequest{}, false, err
	}
	return request, ok, nil
}
