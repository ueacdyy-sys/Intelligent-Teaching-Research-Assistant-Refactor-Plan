package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type QuestionBankDraftContentReader interface {
	GetQuestionBankDraftContentForStudent(
		ctx context.Context,
		draftRef string,
		studentID string,
	) (domain.QuestionBankDraftContent, bool, error)
}

type ReadStudentAppQuestionBankDraftContent struct {
	reader QuestionBankDraftContentReader
}

func NewReadStudentAppQuestionBankDraftContent(
	reader QuestionBankDraftContentReader,
) *ReadStudentAppQuestionBankDraftContent {
	return &ReadStudentAppQuestionBankDraftContent{reader: reader}
}

func (uc *ReadStudentAppQuestionBankDraftContent) Execute(
	ctx context.Context,
	input domain.ReadStudentAppQuestionBankDraftContentInput,
) (domain.QuestionBankDraftContent, error) {
	normalized, err := domain.NormalizeReadStudentAppQuestionBankDraftContentInput(input)
	if err != nil {
		return domain.QuestionBankDraftContent{}, err
	}
	content, ok, err := uc.reader.GetQuestionBankDraftContentForStudent(
		ctx,
		normalized.QuestionBankDraftRef,
		normalized.StudentID,
	)
	if err != nil {
		return domain.QuestionBankDraftContent{}, err
	}
	if !ok {
		return domain.QuestionBankDraftContent{}, domain.ErrNotFound
	}
	return domain.BuildStudentAppQuestionBankDraftContent(normalized, content)
}
