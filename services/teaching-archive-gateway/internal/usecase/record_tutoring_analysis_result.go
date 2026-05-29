package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type TutoringAnalysisResultRepository interface {
	GetTutoringAnalysisRequestByID(ctx context.Context, id string) (domain.TutoringAnalysisRequest, bool, error)
	RecordTutoringAnalysisResult(ctx context.Context, request domain.TutoringAnalysisRequest) error
}

type RecordTutoringAnalysisResult struct {
	repository TutoringAnalysisResultRepository
	clock      Clock
}

func NewRecordTutoringAnalysisResult(
	repository TutoringAnalysisResultRepository,
	clock Clock,
) *RecordTutoringAnalysisResult {
	return &RecordTutoringAnalysisResult{
		repository: repository,
		clock:      clock,
	}
}

func (uc *RecordTutoringAnalysisResult) Execute(
	ctx context.Context,
	input domain.RecordTutoringAnalysisResultInput,
) (domain.TutoringAnalysisRequest, error) {
	if err := domain.AuthorizeRecordTutoringAnalysisResult(input.Principal); err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}
	requestID, err := domain.NormalizeTutoringAnalysisRequestID(input.RequestID)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}

	request, ok, err := uc.repository.GetTutoringAnalysisRequestByID(ctx, requestID)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}
	if !ok {
		return domain.TutoringAnalysisRequest{}, domain.ErrNotFound
	}

	input.RequestID = requestID
	updated, err := domain.ApplyTutoringAnalysisResult(request, input, uc.clock.Now())
	if err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}
	if err := uc.repository.RecordTutoringAnalysisResult(ctx, updated); err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}
	return updated, nil
}
