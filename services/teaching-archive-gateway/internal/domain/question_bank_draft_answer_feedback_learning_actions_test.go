package domain_test

import (
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestBuildQuestionBankDraftAnswerFeedbackLearningActionsReturnsSafeSources(t *testing.T) {
	rendered, err := domain.BuildQuestionBankDraftAnswerFeedbackRenderEnvelope(questionBankDraftAnswerFeedbackCardFixture())
	if err != nil {
		t.Fatalf("BuildQuestionBankDraftAnswerFeedbackRenderEnvelope returned error: %v", err)
	}
	actions, err := domain.BuildQuestionBankDraftAnswerFeedbackLearningActions(
		domain.NormalizedReadStudentAppQuestionBankDraftAnswerFeedbackInput{
			Principal:    studentPrincipal("student_001"),
			SubmissionID: "qbank_ans_sub_001",
			StudentID:    "student_001",
		},
		rendered,
	)
	if err != nil {
		t.Fatalf("BuildQuestionBankDraftAnswerFeedbackLearningActions returned error: %v", err)
	}
	if actions.SubmissionID != "qbank_ans_sub_001" ||
		actions.FeedbackArchiveItemID != "tarch_student_feedback_001" ||
		actions.RenderFormat != domain.QuestionBankDraftAnswerFeedbackRenderFormatSafeTextBlocks ||
		len(actions.Actions) != 2 {
		t.Fatalf("actions = %#v", actions)
	}
	for _, action := range actions.Actions {
		if action.TargetEndpoint != "/v1/student-app/ai-tutor-requests" ||
			action.Method != "POST" ||
			action.QuestionBankIntent != domain.QuestionBankIntentGeneratePersonalizedCheck ||
			action.SourceType != domain.StudentAppAITutorLearningActionSourceQuestionBankFeedback ||
			!action.RequiresTutorRequest {
			t.Fatalf("action = %#v", action)
		}
	}
}

func TestBuildQuestionBankDraftAnswerFeedbackLearningActionsRejectsUnsafeRender(t *testing.T) {
	rendered, err := domain.BuildQuestionBankDraftAnswerFeedbackRenderEnvelope(questionBankDraftAnswerFeedbackCardFixture())
	if err != nil {
		t.Fatalf("BuildQuestionBankDraftAnswerFeedbackRenderEnvelope returned error: %v", err)
	}
	rendered.Blocks = rendered.Blocks[:2]
	_, err = domain.BuildQuestionBankDraftAnswerFeedbackLearningActions(
		domain.NormalizedReadStudentAppQuestionBankDraftAnswerFeedbackInput{
			Principal:    studentPrincipal("student_001"),
			SubmissionID: "qbank_ans_sub_001",
			StudentID:    "student_001",
		},
		rendered,
	)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestNormalizeCreateStudentAppAITutorRequestInputAcceptsQuestionBankFeedbackSource(t *testing.T) {
	normalized, err := domain.NormalizeCreateStudentAppAITutorRequestInput(domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: "tarch_student_feedback_001",
		AnalysisGoal:         "continue practice from reviewed feedback",
		QuestionBankIntent:   domain.QuestionBankIntentGeneratePersonalizedCheck,
		LearningActionSource: domain.StudentAppAITutorLearningActionSource{
			SourceType:           domain.StudentAppAITutorLearningActionSourceQuestionBankFeedback,
			ActionType:           domain.StudentAppArchiveItemLearningActionAITutorRequest,
			SubmissionID:         "qbank_ans_sub_001",
			FeedbackStatus:       domain.StudentAppQuestionBankDraftAnswerFeedbackStatusReady,
			FeedbackRenderFormat: domain.QuestionBankDraftAnswerFeedbackRenderFormatSafeTextBlocks,
		},
	})
	if err != nil {
		t.Fatalf("NormalizeCreateStudentAppAITutorRequestInput returned error: %v", err)
	}
	if normalized.LearningActionSource.SourceType != domain.StudentAppAITutorLearningActionSourceQuestionBankFeedback ||
		normalized.LearningActionSource.SubmissionID != "qbank_ans_sub_001" ||
		normalized.LearningActionSource.FeedbackRenderFormat != domain.QuestionBankDraftAnswerFeedbackRenderFormatSafeTextBlocks {
		t.Fatalf("source = %#v", normalized.LearningActionSource)
	}
}
