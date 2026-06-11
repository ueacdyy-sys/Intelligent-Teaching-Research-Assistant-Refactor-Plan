package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type StudentAppQuestionBankDraftAnswerFeedbackCardReader interface {
	Execute(
		ctx context.Context,
		input domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput,
	) (domain.QuestionBankDraftAnswerFeedbackCard, error)
}

type RenderStudentAppQuestionBankDraftAnswerFeedback struct {
	reader StudentAppQuestionBankDraftAnswerFeedbackCardReader
}

func NewRenderStudentAppQuestionBankDraftAnswerFeedback(
	reader StudentAppQuestionBankDraftAnswerFeedbackCardReader,
) *RenderStudentAppQuestionBankDraftAnswerFeedback {
	return &RenderStudentAppQuestionBankDraftAnswerFeedback{reader: reader}
}

func (uc *RenderStudentAppQuestionBankDraftAnswerFeedback) Execute(
	ctx context.Context,
	input domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput,
) (domain.QuestionBankDraftAnswerFeedbackRenderEnvelope, error) {
	card, err := uc.reader.Execute(ctx, input)
	if err != nil {
		return domain.QuestionBankDraftAnswerFeedbackRenderEnvelope{}, err
	}
	return domain.BuildQuestionBankDraftAnswerFeedbackRenderEnvelope(card)
}
