package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type AIGradingResultRepository interface {
	GetAIGradingRequestByID(ctx context.Context, id string) (domain.AIGradingRequest, bool, error)
	RecordAIGradingResult(ctx context.Context, request domain.AIGradingRequest) error
}

type RecordAIGradingResult struct {
	repository AIGradingResultRepository
	clock      Clock
}

func NewRecordAIGradingResult(
	repository AIGradingResultRepository,
	clock Clock,
) *RecordAIGradingResult {
	return &RecordAIGradingResult{
		repository: repository,
		clock:      clock,
	}
}

func (uc *RecordAIGradingResult) Execute(
	ctx context.Context,
	input domain.RecordAIGradingResultInput,
) (domain.AIGradingRequest, error) {
	if err := domain.AuthorizeRecordAIGradingResult(input.Principal); err != nil {
		return domain.AIGradingRequest{}, err
	}
	requestID, err := domain.NormalizeAIGradingRequestID(input.RequestID)
	if err != nil {
		return domain.AIGradingRequest{}, err
	}

	request, ok, err := uc.repository.GetAIGradingRequestByID(ctx, requestID)
	if err != nil {
		return domain.AIGradingRequest{}, err
	}
	if !ok {
		return domain.AIGradingRequest{}, domain.ErrNotFound
	}

	input.RequestID = requestID
	updated, err := domain.ApplyAIGradingResult(request, input, uc.clock.Now())
	if err != nil {
		return domain.AIGradingRequest{}, err
	}
	if err := uc.repository.RecordAIGradingResult(ctx, updated); err != nil {
		return domain.AIGradingRequest{}, err
	}
	return updated, nil
}
