package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type StudentAppQuestionBankDraftAnswerScoringResultRepository interface {
	GetQuestionBankDraftAnswerSubmissionForStudent(
		ctx context.Context,
		submissionID string,
		studentID string,
	) (domain.QuestionBankDraftAnswerSubmission, bool, error)
	GetLatestQuestionBankDraftAnswerScoringRequestForStudent(
		ctx context.Context,
		submissionID string,
		studentID string,
	) (domain.AIGradingRequest, bool, error)
}

type ReadStudentAppQuestionBankDraftAnswerScoringResult struct {
	repository StudentAppQuestionBankDraftAnswerScoringResultRepository
}

func NewReadStudentAppQuestionBankDraftAnswerScoringResult(
	repository StudentAppQuestionBankDraftAnswerScoringResultRepository,
) *ReadStudentAppQuestionBankDraftAnswerScoringResult {
	return &ReadStudentAppQuestionBankDraftAnswerScoringResult{repository: repository}
}

func (uc *ReadStudentAppQuestionBankDraftAnswerScoringResult) Execute(
	ctx context.Context,
	input domain.ReadStudentAppQuestionBankDraftAnswerScoringResultInput,
) (domain.QuestionBankDraftAnswerScoringResult, error) {
	normalized, err := domain.NormalizeReadStudentAppQuestionBankDraftAnswerScoringResultInput(input)
	if err != nil {
		return domain.QuestionBankDraftAnswerScoringResult{}, err
	}
	submission, ok, err := uc.repository.GetQuestionBankDraftAnswerSubmissionForStudent(
		ctx,
		normalized.SubmissionID,
		normalized.StudentID,
	)
	if err != nil {
		return domain.QuestionBankDraftAnswerScoringResult{}, err
	}
	if !ok {
		return domain.QuestionBankDraftAnswerScoringResult{}, domain.ErrNotFound
	}
	request, ok, err := uc.repository.GetLatestQuestionBankDraftAnswerScoringRequestForStudent(
		ctx,
		normalized.SubmissionID,
		normalized.StudentID,
	)
	if err != nil {
		return domain.QuestionBankDraftAnswerScoringResult{}, err
	}
	if !ok {
		return domain.QuestionBankDraftAnswerScoringResult{}, domain.ErrNotFound
	}
	return domain.BuildStudentAppQuestionBankDraftAnswerScoringResult(
		normalized,
		submission,
		request,
	)
}
