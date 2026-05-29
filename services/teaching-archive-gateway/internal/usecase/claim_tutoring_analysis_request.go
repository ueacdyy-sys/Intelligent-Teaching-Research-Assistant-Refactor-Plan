package usecase

import (
	"context"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type TutoringAnalysisClaimRepository interface {
	ClaimNextTutoringAnalysisRequest(
		ctx context.Context,
		input domain.ClaimTutoringAnalysisRequestInput,
		now time.Time,
	) (domain.TutoringAnalysisRequest, bool, error)
}

type ClaimTutoringAnalysisRequest struct {
	repository TutoringAnalysisClaimRepository
	clock      Clock
}

func NewClaimTutoringAnalysisRequest(
	repository TutoringAnalysisClaimRepository,
	clock Clock,
) *ClaimTutoringAnalysisRequest {
	return &ClaimTutoringAnalysisRequest{
		repository: repository,
		clock:      clock,
	}
}

func (uc *ClaimTutoringAnalysisRequest) Execute(
	ctx context.Context,
	input domain.ClaimTutoringAnalysisRequestInput,
) (domain.TutoringAnalysisRequest, bool, error) {
	if err := domain.AuthorizeClaimTutoringAnalysisRequest(input.Principal); err != nil {
		return domain.TutoringAnalysisRequest{}, false, err
	}
	normalized, err := domain.NormalizeClaimTutoringAnalysisRequestInput(input)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, false, err
	}
	request, ok, err := uc.repository.ClaimNextTutoringAnalysisRequest(ctx, normalized, uc.clock.Now())
	if err != nil {
		return domain.TutoringAnalysisRequest{}, false, err
	}
	return request, ok, nil
}
