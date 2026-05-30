package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type CreateScannedQuizSubmission struct {
	repository QuizSubmissionRepository
	ids        IDGenerator
	clock      Clock
}

func NewCreateScannedQuizSubmission(
	repository QuizSubmissionRepository,
	ids IDGenerator,
	clock Clock,
) *CreateScannedQuizSubmission {
	return &CreateScannedQuizSubmission{
		repository: repository,
		ids:        ids,
		clock:      clock,
	}
}

func (uc *CreateScannedQuizSubmission) Execute(
	ctx context.Context,
	input domain.CreateScannedQuizSubmissionInput,
) (domain.QuizSubmission, error) {
	normalized, err := domain.NormalizeCreateScannedQuizSubmissionInput(input)
	if err != nil {
		return domain.QuizSubmission{}, err
	}

	item, ok, err := uc.repository.GetByID(ctx, normalized.QuizArchiveItemID)
	if err != nil {
		return domain.QuizSubmission{}, err
	}
	if !ok {
		return domain.QuizSubmission{}, domain.ErrNotFound
	}
	if err := domain.AuthorizeCreateQuizSubmission(normalized.Principal, item, normalized.StudentID); err != nil {
		return domain.QuizSubmission{}, err
	}

	submission, err := domain.NewQuizSubmission(uc.ids.NewID(), normalized, uc.clock.Now())
	if err != nil {
		return domain.QuizSubmission{}, err
	}
	if err := uc.repository.CreateQuizSubmission(ctx, submission); err != nil {
		return domain.QuizSubmission{}, err
	}
	return submission, nil
}
