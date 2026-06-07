package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type QuizSubmissionRepository interface {
	GetByID(ctx context.Context, id string) (domain.ArchiveItem, bool, error)
	CreateQuizSubmission(ctx context.Context, submission domain.QuizSubmission) (WritePersistenceOutcome, error)
}

type teachingQuizSubmissionFastRepository interface {
	CreateQuizSubmissionForExistingTeachingQuiz(
		ctx context.Context,
		submission domain.QuizSubmission,
	) (bool, WritePersistenceOutcome, error)
}

type CreateQuizSubmissionResult struct {
	Submission  domain.QuizSubmission
	Persistence WritePersistenceOutcome
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
	result, err := uc.ExecuteWithPersistence(ctx, input)
	if err != nil {
		return domain.QuizSubmission{}, err
	}
	return result.Submission, nil
}

func (uc *CreateQuizSubmission) ExecuteWithPersistence(
	ctx context.Context,
	input domain.CreateQuizSubmissionInput,
) (CreateQuizSubmissionResult, error) {
	normalized, err := domain.NormalizeCreateQuizSubmissionInput(input)
	if err != nil {
		return CreateQuizSubmissionResult{}, err
	}

	var fastResult *CreateQuizSubmissionResult
	if fastRepository, ok := uc.repository.(teachingQuizSubmissionFastRepository); ok {
		result, created, err := uc.createFastForKnownTeachingQuiz(ctx, fastRepository, normalized)
		if err != nil {
			return CreateQuizSubmissionResult{}, err
		}
		if created {
			return result, nil
		}
		if result.Submission.ID != "" {
			fastResult = &result
		}
	}

	return uc.createAfterArchiveLookup(ctx, normalized, fastResult)
}

func (uc *CreateQuizSubmission) createFastForKnownTeachingQuiz(
	ctx context.Context,
	repository teachingQuizSubmissionFastRepository,
	normalized domain.CreateQuizSubmissionInput,
) (CreateQuizSubmissionResult, bool, error) {
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
		return CreateQuizSubmissionResult{}, false, nil
	}

	submission, err := domain.NewQuizSubmission(uc.ids.NewID(), normalized, uc.clock.Now())
	if err != nil {
		return CreateQuizSubmissionResult{}, false, err
	}
	created, persistence, err := repository.CreateQuizSubmissionForExistingTeachingQuiz(ctx, submission)
	if err != nil {
		return CreateQuizSubmissionResult{}, false, err
	}
	return CreateQuizSubmissionResult{
		Submission:  submission,
		Persistence: normalizeWritePersistenceOutcome(persistence),
	}, created, nil
}

func (uc *CreateQuizSubmission) createAfterArchiveLookup(
	ctx context.Context,
	normalized domain.CreateQuizSubmissionInput,
	prepared *CreateQuizSubmissionResult,
) (CreateQuizSubmissionResult, error) {
	item, ok, err := uc.repository.GetByID(ctx, normalized.QuizArchiveItemID)
	if err != nil {
		return CreateQuizSubmissionResult{}, err
	}
	if !ok {
		return CreateQuizSubmissionResult{}, domain.ErrNotFound
	}
	if err := domain.AuthorizeCreateQuizSubmission(normalized.Principal, item, normalized.StudentID); err != nil {
		return CreateQuizSubmissionResult{}, err
	}

	var submission domain.QuizSubmission
	if prepared != nil {
		submission = prepared.Submission
	} else {
		var err error
		submission, err = domain.NewQuizSubmission(uc.ids.NewID(), normalized, uc.clock.Now())
		if err != nil {
			return CreateQuizSubmissionResult{}, err
		}
	}
	persistence, err := uc.repository.CreateQuizSubmission(ctx, submission)
	if err != nil {
		return CreateQuizSubmissionResult{}, err
	}
	return CreateQuizSubmissionResult{
		Submission:  submission,
		Persistence: normalizeWritePersistenceOutcome(persistence),
	}, nil
}
