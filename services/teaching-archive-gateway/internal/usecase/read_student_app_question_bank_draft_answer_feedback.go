package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type StudentAppQuestionBankDraftAnswerFeedbackRepository interface {
	GetByID(ctx context.Context, id string) (domain.ArchiveItem, bool, error)
	GetQuestionBankDraftAnswerSubmissionForStudent(
		ctx context.Context,
		submissionID string,
		studentID string,
	) (domain.QuestionBankDraftAnswerSubmission, bool, error)
	GetLatestQuestionBankDraftAnswerFeedbackArchiveSnapshotForStudent(
		ctx context.Context,
		submissionID string,
		studentID string,
	) (domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot, bool, error)
}

type ReadStudentAppQuestionBankDraftAnswerFeedback struct {
	repository StudentAppQuestionBankDraftAnswerFeedbackRepository
}

func NewReadStudentAppQuestionBankDraftAnswerFeedback(
	repository StudentAppQuestionBankDraftAnswerFeedbackRepository,
) *ReadStudentAppQuestionBankDraftAnswerFeedback {
	return &ReadStudentAppQuestionBankDraftAnswerFeedback{repository: repository}
}

func (uc *ReadStudentAppQuestionBankDraftAnswerFeedback) Execute(
	ctx context.Context,
	input domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput,
) (domain.QuestionBankDraftAnswerFeedbackCard, error) {
	normalized, err := domain.NormalizeReadStudentAppQuestionBankDraftAnswerFeedbackInput(input)
	if err != nil {
		return domain.QuestionBankDraftAnswerFeedbackCard{}, err
	}
	submission, ok, err := uc.repository.GetQuestionBankDraftAnswerSubmissionForStudent(
		ctx,
		normalized.SubmissionID,
		normalized.StudentID,
	)
	if err != nil {
		return domain.QuestionBankDraftAnswerFeedbackCard{}, err
	}
	if !ok {
		return domain.QuestionBankDraftAnswerFeedbackCard{}, domain.ErrNotFound
	}
	snapshot, ok, err := uc.repository.GetLatestQuestionBankDraftAnswerFeedbackArchiveSnapshotForStudent(
		ctx,
		normalized.SubmissionID,
		normalized.StudentID,
	)
	if err != nil {
		return domain.QuestionBankDraftAnswerFeedbackCard{}, err
	}
	if !ok {
		return domain.QuestionBankDraftAnswerFeedbackCard{}, domain.ErrNotFound
	}
	archiveItem, ok, err := uc.repository.GetByID(ctx, snapshot.FeedbackArchiveItemID)
	if err != nil {
		return domain.QuestionBankDraftAnswerFeedbackCard{}, err
	}
	if !ok {
		return domain.QuestionBankDraftAnswerFeedbackCard{}, domain.ErrNotFound
	}
	return domain.BuildStudentAppQuestionBankDraftAnswerFeedbackCard(
		normalized,
		submission,
		archiveItem,
		snapshot,
	)
}
