package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type QuizSubmissionRepository interface {
	GetByID(ctx context.Context, id string) (domain.ArchiveItem, bool, error)
	CreateQuizSubmission(ctx context.Context, submission domain.QuizSubmission) error
}

type teachingQuizSubmissionFastRepository interface {
	CreateQuizSubmissionForExistingTeachingQuiz(ctx context.Context, submission domain.QuizSubmission) (bool, error)
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

	var fastSubmission *domain.QuizSubmission
	if fastRepository, ok := uc.repository.(teachingQuizSubmissionFastRepository); ok {
		submission, created, err := uc.createFastForKnownTeachingQuiz(ctx, fastRepository, normalized)
		if err != nil {
			return domain.QuizSubmission{}, err
		}
		if created {
			return submission, nil
		}
		if submission.ID != "" {
			fastSubmission = &submission
		}
	}

	return uc.createAfterArchiveLookup(ctx, normalized, fastSubmission)
}

func (uc *CreateQuizSubmission) createFastForKnownTeachingQuiz(
	ctx context.Context,
	repository teachingQuizSubmissionFastRepository,
	normalized domain.CreateQuizSubmissionInput,
) (domain.QuizSubmission, bool, error) {
	knownTeachingQuiz := domain.ArchiveItem{
		ID:           normalized.QuizArchiveItemID,
		OwnerType:    domain.OwnerTypeTeaching,
		MaterialType: domain.MaterialTypeQuiz,
	}
	if err := domain.AuthorizeCreateQuizSubmission(
		normalized.Principal,
		knownTeachingQuiz,
		normalized.StudentID,
	); err != nil {
		return domain.QuizSubmission{}, false, nil
	}

	submission, err := domain.NewQuizSubmission(uc.ids.NewID(), normalized, uc.clock.Now())
	if err != nil {
		return domain.QuizSubmission{}, false, err
	}
	created, err := repository.CreateQuizSubmissionForExistingTeachingQuiz(ctx, submission)
	if err != nil {
		return domain.QuizSubmission{}, false, err
	}
	return submission, created, nil
}

func (uc *CreateQuizSubmission) createAfterArchiveLookup(
	ctx context.Context,
	normalized domain.CreateQuizSubmissionInput,
	prepared *domain.QuizSubmission,
) (domain.QuizSubmission, error) {
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

	var submission domain.QuizSubmission
	if prepared != nil {
		submission = *prepared
	} else {
		var err error
		submission, err = domain.NewQuizSubmission(uc.ids.NewID(), normalized, uc.clock.Now())
		if err != nil {
			return domain.QuizSubmission{}, err
		}
	}
	if err := uc.repository.CreateQuizSubmission(ctx, submission); err != nil {
		return domain.QuizSubmission{}, err
	}
	return submission, nil
}
