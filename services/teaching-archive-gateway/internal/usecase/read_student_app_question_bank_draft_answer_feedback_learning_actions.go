package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type QuestionBankDraftAnswerFeedbackRenderer interface {
	Execute(
		ctx context.Context,
		input domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput,
	) (domain.QuestionBankDraftAnswerFeedbackRenderEnvelope, error)
}

type ReadStudentAppQuestionBankDraftAnswerFeedbackLearningActions struct {
	renderer QuestionBankDraftAnswerFeedbackRenderer
}

func NewReadStudentAppQuestionBankDraftAnswerFeedbackLearningActions(
	renderer QuestionBankDraftAnswerFeedbackRenderer,
) *ReadStudentAppQuestionBankDraftAnswerFeedbackLearningActions {
	return &ReadStudentAppQuestionBankDraftAnswerFeedbackLearningActions{renderer: renderer}
}

func (uc *ReadStudentAppQuestionBankDraftAnswerFeedbackLearningActions) Execute(
	ctx context.Context,
	input domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput,
) (domain.QuestionBankDraftAnswerFeedbackLearningActions, error) {
	normalized, err := domain.NormalizeReadStudentAppQuestionBankDraftAnswerFeedbackInput(input)
	if err != nil {
		return domain.QuestionBankDraftAnswerFeedbackLearningActions{}, err
	}
	if err := domain.AuthorizeCreateStudentAppAITutorRequest(normalized.Principal); err != nil {
		return domain.QuestionBankDraftAnswerFeedbackLearningActions{}, err
	}
	rendered, err := uc.renderer.Execute(ctx, input)
	if err != nil {
		return domain.QuestionBankDraftAnswerFeedbackLearningActions{}, err
	}
	return domain.BuildQuestionBankDraftAnswerFeedbackLearningActions(normalized, rendered)
}
