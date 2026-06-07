package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type QuestionBankDraftAnswerScoringInputRepository interface {
	GetAIGradingRequestByID(ctx context.Context, id string) (domain.AIGradingRequest, bool, error)
	GetQuestionBankDraftAnswerSubmissionForStudent(
		ctx context.Context,
		submissionID string,
		studentID string,
	) (domain.QuestionBankDraftAnswerSubmission, bool, error)
	GetQuestionBankDraftContentForStudent(
		ctx context.Context,
		draftRef string,
		studentID string,
	) (domain.QuestionBankDraftContent, bool, error)
}

type ReadQuestionBankDraftAnswerScoringInput struct {
	repository QuestionBankDraftAnswerScoringInputRepository
	clock      Clock
}

func NewReadQuestionBankDraftAnswerScoringInput(
	repository QuestionBankDraftAnswerScoringInputRepository,
	clock Clock,
) *ReadQuestionBankDraftAnswerScoringInput {
	return &ReadQuestionBankDraftAnswerScoringInput{
		repository: repository,
		clock:      clock,
	}
}

func (uc *ReadQuestionBankDraftAnswerScoringInput) Execute(
	ctx context.Context,
	input domain.ReadQuestionBankDraftAnswerScoringInputInput,
) (domain.QuestionBankDraftAnswerScoringInput, error) {
	normalized, err := domain.NormalizeReadQuestionBankDraftAnswerScoringInputInput(input)
	if err != nil {
		return domain.QuestionBankDraftAnswerScoringInput{}, err
	}
	request, ok, err := uc.repository.GetAIGradingRequestByID(ctx, normalized.RequestID)
	if err != nil {
		return domain.QuestionBankDraftAnswerScoringInput{}, err
	}
	if !ok {
		return domain.QuestionBankDraftAnswerScoringInput{}, domain.ErrNotFound
	}
	now := uc.clock.Now()
	if err := domain.ValidateQuestionBankDraftAnswerScoringInputRequest(normalized, request, now); err != nil {
		return domain.QuestionBankDraftAnswerScoringInput{}, err
	}
	submission, ok, err := uc.repository.GetQuestionBankDraftAnswerSubmissionForStudent(
		ctx,
		request.SourceQuestionBankAnswerSubmissionID,
		request.SourceArchiveStudentID,
	)
	if err != nil {
		return domain.QuestionBankDraftAnswerScoringInput{}, err
	}
	if !ok {
		return domain.QuestionBankDraftAnswerScoringInput{}, domain.ErrNotFound
	}
	content, ok, err := uc.repository.GetQuestionBankDraftContentForStudent(
		ctx,
		request.SourceQuestionBankDraftRef,
		request.SourceArchiveStudentID,
	)
	if err != nil {
		return domain.QuestionBankDraftAnswerScoringInput{}, err
	}
	if !ok {
		return domain.QuestionBankDraftAnswerScoringInput{}, domain.ErrNotFound
	}
	return domain.BuildQuestionBankDraftAnswerScoringInput(
		normalized,
		request,
		submission,
		content,
		now,
	)
}
