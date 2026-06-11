package usecase_test

import (
	"context"
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadStudentAppQuestionBankDraftAnswerFeedbackLearningActionsUsesRenderer(t *testing.T) {
	rendered, err := domain.BuildQuestionBankDraftAnswerFeedbackRenderEnvelope(questionBankDraftAnswerFeedbackReadCardForRender())
	if err != nil {
		t.Fatalf("BuildQuestionBankDraftAnswerFeedbackRenderEnvelope returned error: %v", err)
	}
	renderer := &fakeQuestionBankDraftAnswerFeedbackRenderer{rendered: rendered}
	uc := usecase.NewReadStudentAppQuestionBankDraftAnswerFeedbackLearningActions(renderer)

	actions, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput{
		Principal:    studentPrincipal("student_001"),
		SubmissionID: "qbank_ans_sub_001",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if renderer.reads != 1 ||
		actions.SubmissionID != "qbank_ans_sub_001" ||
		actions.FeedbackArchiveItemID != "tarch_student_feedback_001" ||
		len(actions.Actions) != 2 {
		t.Fatalf("reads=%d actions=%#v", renderer.reads, actions)
	}
}

func TestReadStudentAppQuestionBankDraftAnswerFeedbackLearningActionsRejectsTeacher(t *testing.T) {
	renderer := &fakeQuestionBankDraftAnswerFeedbackRenderer{}
	uc := usecase.NewReadStudentAppQuestionBankDraftAnswerFeedbackLearningActions(renderer)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput{
		Principal:    teacherPrincipal(),
		SubmissionID: "qbank_ans_sub_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if renderer.reads != 0 {
		t.Fatalf("renderer reads = %d", renderer.reads)
	}
}

type fakeQuestionBankDraftAnswerFeedbackRenderer struct {
	rendered domain.QuestionBankDraftAnswerFeedbackRenderEnvelope
	err      error
	reads    int
}

func (f *fakeQuestionBankDraftAnswerFeedbackRenderer) Execute(
	_ context.Context,
	_ domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput,
) (domain.QuestionBankDraftAnswerFeedbackRenderEnvelope, error) {
	f.reads++
	if f.err != nil {
		return domain.QuestionBankDraftAnswerFeedbackRenderEnvelope{}, f.err
	}
	return f.rendered, nil
}
