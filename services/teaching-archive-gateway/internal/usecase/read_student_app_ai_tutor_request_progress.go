package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type ReadStudentAppAITutorRequestProgress struct {
	reader TutoringAnalysisRequestReader
}

func NewReadStudentAppAITutorRequestProgress(
	reader TutoringAnalysisRequestReader,
) *ReadStudentAppAITutorRequestProgress {
	return &ReadStudentAppAITutorRequestProgress{reader: reader}
}

func (uc *ReadStudentAppAITutorRequestProgress) Execute(
	ctx context.Context,
	input domain.ReadStudentAppAITutorRequestProgressInput,
) (domain.StudentAppAITutorRequestProgressCard, error) {
	query, err := domain.NormalizeReadStudentAppAITutorRequestProgressInput(input)
	if err != nil {
		return domain.StudentAppAITutorRequestProgressCard{}, err
	}
	requests, err := uc.reader.ListTutoringAnalysisRequests(ctx, query)
	if err != nil {
		return domain.StudentAppAITutorRequestProgressCard{}, err
	}
	if len(requests) == 0 {
		return domain.StudentAppAITutorRequestProgressCard{}, domain.ErrNotFound
	}
	return domain.BuildStudentAppAITutorRequestProgressCard(requests[0])
}
