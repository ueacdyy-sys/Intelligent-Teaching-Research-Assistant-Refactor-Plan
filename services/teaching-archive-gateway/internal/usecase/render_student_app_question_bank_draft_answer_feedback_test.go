package usecase_test

import (
	"context"
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestRenderStudentAppQuestionBankDraftAnswerFeedbackUsesSafeCardReader(t *testing.T) {
	reader := &fakeQuestionBankDraftAnswerFeedbackCardReader{
		card: questionBankDraftAnswerFeedbackReadCardForRender(),
	}
	uc := usecase.NewRenderStudentAppQuestionBankDraftAnswerFeedback(reader)

	rendered, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput{
		Principal:    studentPrincipal("student_001"),
		SubmissionID: "qbank_ans_sub_001",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if reader.reads != 1 ||
		rendered.RenderFormat != domain.QuestionBankDraftAnswerFeedbackRenderFormatSafeTextBlocks ||
		len(rendered.Blocks) < 4 ||
		rendered.Blocks[0].BlockType != domain.QuestionBankDraftAnswerFeedbackBlockTypeScoreSummary {
		t.Fatalf("reads=%d rendered=%#v", reader.reads, rendered)
	}
}

func TestRenderStudentAppQuestionBankDraftAnswerFeedbackPropagatesReaderErrors(t *testing.T) {
	reader := &fakeQuestionBankDraftAnswerFeedbackCardReader{err: domain.ErrNotFound}
	uc := usecase.NewRenderStudentAppQuestionBankDraftAnswerFeedback(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput{
		Principal:    studentPrincipal("student_001"),
		SubmissionID: "qbank_ans_sub_001",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
}

type fakeQuestionBankDraftAnswerFeedbackCardReader struct {
	card  domain.QuestionBankDraftAnswerFeedbackCard
	err   error
	reads int
}

func (f *fakeQuestionBankDraftAnswerFeedbackCardReader) Execute(
	_ context.Context,
	_ domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput,
) (domain.QuestionBankDraftAnswerFeedbackCard, error) {
	f.reads++
	if f.err != nil {
		return domain.QuestionBankDraftAnswerFeedbackCard{}, f.err
	}
	return f.card, nil
}

func questionBankDraftAnswerFeedbackReadCardForRender() domain.QuestionBankDraftAnswerFeedbackCard {
	submission := questionBankDraftAnswerSubmissionForFeedbackRead("qbank_ans_sub_001", "student_001")
	snapshot := questionBankDraftAnswerFeedbackReadSnapshot("tarch_student_feedback_001", "qbank_ans_sub_001", "student_001")
	item := questionBankDraftAnswerFeedbackReadArchiveItem("tarch_student_feedback_001", "student_001")
	card, err := domain.BuildStudentAppQuestionBankDraftAnswerFeedbackCard(
		domain.NormalizedReadStudentAppQuestionBankDraftAnswerFeedbackInput{
			Principal:    studentPrincipal("student_001"),
			SubmissionID: "qbank_ans_sub_001",
			StudentID:    "student_001",
		},
		submission,
		item,
		snapshot,
	)
	if err != nil {
		panic(err)
	}
	return card
}
