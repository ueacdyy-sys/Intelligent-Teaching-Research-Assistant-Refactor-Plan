package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type QuestionBankDraftAnswerSubmissionRepository interface {
	GetQuestionBankDraftContentForStudent(
		ctx context.Context,
		draftRef string,
		studentID string,
	) (domain.QuestionBankDraftContent, bool, error)
	SubmitQuestionBankDraftAnswerSubmission(
		ctx context.Context,
		submission domain.QuestionBankDraftAnswerSubmission,
	) (WritePersistenceOutcome, error)
}

type SubmitStudentAppQuestionBankDraftAnswerResult struct {
	Submission  domain.QuestionBankDraftAnswerSubmission
	Persistence WritePersistenceOutcome
}

type SubmitStudentAppQuestionBankDraftAnswer struct {
	repository QuestionBankDraftAnswerSubmissionRepository
	ids        IDGenerator
	clock      Clock
}

func NewSubmitStudentAppQuestionBankDraftAnswer(
	repository QuestionBankDraftAnswerSubmissionRepository,
	ids IDGenerator,
	clock Clock,
) *SubmitStudentAppQuestionBankDraftAnswer {
	return &SubmitStudentAppQuestionBankDraftAnswer{
		repository: repository,
		ids:        ids,
		clock:      clock,
	}
}

func (uc *SubmitStudentAppQuestionBankDraftAnswer) Execute(
	ctx context.Context,
	input domain.SubmitStudentAppQuestionBankDraftAnswerInput,
) (domain.QuestionBankDraftAnswerSubmission, error) {
	result, err := uc.ExecuteWithPersistence(ctx, input)
	if err != nil {
		return domain.QuestionBankDraftAnswerSubmission{}, err
	}
	return result.Submission, nil
}

func (uc *SubmitStudentAppQuestionBankDraftAnswer) ExecuteWithPersistence(
	ctx context.Context,
	input domain.SubmitStudentAppQuestionBankDraftAnswerInput,
) (SubmitStudentAppQuestionBankDraftAnswerResult, error) {
	normalized, err := domain.NormalizeSubmitStudentAppQuestionBankDraftAnswerInput(input)
	if err != nil {
		return SubmitStudentAppQuestionBankDraftAnswerResult{}, err
	}
	content, ok, err := uc.repository.GetQuestionBankDraftContentForStudent(
		ctx,
		normalized.QuestionBankDraftRef,
		normalized.StudentID,
	)
	if err != nil {
		return SubmitStudentAppQuestionBankDraftAnswerResult{}, err
	}
	if !ok {
		return SubmitStudentAppQuestionBankDraftAnswerResult{}, domain.ErrNotFound
	}
	submission, err := domain.NewQuestionBankDraftAnswerSubmission(
		uc.ids.NewID(),
		normalized,
		content,
		uc.clock.Now(),
	)
	if err != nil {
		return SubmitStudentAppQuestionBankDraftAnswerResult{}, err
	}
	persistence, err := uc.repository.SubmitQuestionBankDraftAnswerSubmission(ctx, submission)
	if err != nil {
		return SubmitStudentAppQuestionBankDraftAnswerResult{}, err
	}
	return SubmitStudentAppQuestionBankDraftAnswerResult{
		Submission:  submission,
		Persistence: normalizeWritePersistenceOutcome(persistence),
	}, nil
}
