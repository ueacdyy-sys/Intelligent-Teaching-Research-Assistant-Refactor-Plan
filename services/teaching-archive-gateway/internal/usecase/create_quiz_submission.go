package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type QuizSubmissionRepository interface {
	GetByID(ctx context.Context, id string) (domain.ArchiveItem, bool, error)
	CreateQuizSubmission(ctx context.Context, submission domain.QuizSubmission) error
}

type CreateQuizSubmission struct {
	repository QuizSubmissionRepository
	ids        IDGenerator
	clock      Clock
}

func NewCreateQuizSubmission(
	repository QuizSubmissionRepository,
	ids IDGenerator,
	clock Clock,
) *CreateQuizSubmission {
	return &CreateQuizSubmission{
		repository: repository,
		ids:        ids,
		clock:      clock,
	}
}

func (uc *CreateQuizSubmission) Execute(
	ctx context.Context,
	input domain.CreateQuizSubmissionInput,
) (domain.QuizSubmission, error) {
	normalized, err := domain.NormalizeCreateQuizSubmissionInput(input)
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
