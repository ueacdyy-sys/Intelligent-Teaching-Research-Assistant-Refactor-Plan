package domain_test

import (
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestBuildStudentAppAITutorResultArchiveLearningActionsReturnsSafeActionSources(t *testing.T) {
	rendered, err := domain.BuildStudentAppAITutorResultArchiveRenderEnvelope(aiTutorResultArchiveCardFixture())
	if err != nil {
		t.Fatalf("BuildStudentAppAITutorResultArchiveRenderEnvelope returned error: %v", err)
	}
	actions, err := domain.BuildStudentAppAITutorResultArchiveLearningActions(
		normalizedResultArchiveInput(),
		rendered,
	)
	if err != nil {
		t.Fatalf("BuildStudentAppAITutorResultArchiveLearningActions returned error: %v", err)
	}
	if actions.ArchiveItemID != "tarch_student_ai_tutor_result_001" ||
		actions.SourceArchiveItemID != "tarch_source_student_homework_001" ||
		actions.SourceTutoringRequestID != "tutor_req_student_app_001" ||
		actions.Status != domain.StudentAppAITutorResultArchiveStatusReady ||
		actions.RenderFormat != domain.StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks ||
		actions.FollowUpDepth != 0 ||
		len(actions.Actions) != 2 {
		t.Fatalf("actions = %#v", actions)
	}
	for _, action := range actions.Actions {
		if action.TargetEndpoint != "/v1/student-app/ai-tutor-requests" ||
			action.Method != "POST" ||
			action.SourceType != domain.StudentAppAITutorLearningActionSourceResultArchive ||
			action.FollowUpDepth != 1 ||
			!action.RequiresTutorRequest {
			t.Fatalf("action = %#v", action)
		}
	}
}

func TestBuildStudentAppAITutorResultArchiveLearningActionsAdvancesFollowUpDepth(t *testing.T) {
	card := aiTutorResultArchiveCardFixture()
	card.FollowUpDepth = 1
	rendered, err := domain.BuildStudentAppAITutorResultArchiveRenderEnvelope(card)
	if err != nil {
		t.Fatalf("BuildStudentAppAITutorResultArchiveRenderEnvelope returned error: %v", err)
	}

	actions, err := domain.BuildStudentAppAITutorResultArchiveLearningActions(
		normalizedResultArchiveInput(),
		rendered,
	)
	if err != nil {
		t.Fatalf("BuildStudentAppAITutorResultArchiveLearningActions returned error: %v", err)
	}
	if actions.FollowUpDepth != 1 || len(actions.Actions) != 2 {
		t.Fatalf("actions = %#v", actions)
	}
	for _, action := range actions.Actions {
		if action.FollowUpDepth != 2 {
			t.Fatalf("action = %#v", action)
		}
	}
}

func TestBuildStudentAppAITutorResultArchiveLearningActionsStopsAtMaxFollowUpDepth(t *testing.T) {
	card := aiTutorResultArchiveCardFixture()
	card.FollowUpDepth = 2
	rendered, err := domain.BuildStudentAppAITutorResultArchiveRenderEnvelope(card)
	if err != nil {
		t.Fatalf("BuildStudentAppAITutorResultArchiveRenderEnvelope returned error: %v", err)
	}

	actions, err := domain.BuildStudentAppAITutorResultArchiveLearningActions(
		normalizedResultArchiveInput(),
		rendered,
	)
	if err != nil {
		t.Fatalf("BuildStudentAppAITutorResultArchiveLearningActions returned error: %v", err)
	}
	if actions.FollowUpDepth != 2 || len(actions.Actions) != 0 {
		t.Fatalf("actions = %#v", actions)
	}
}

func TestBuildStudentAppAITutorResultArchiveLearningActionsRejectsUnsafeEnvelope(t *testing.T) {
	rendered, err := domain.BuildStudentAppAITutorResultArchiveRenderEnvelope(aiTutorResultArchiveCardFixture())
	if err != nil {
		t.Fatalf("BuildStudentAppAITutorResultArchiveRenderEnvelope returned error: %v", err)
	}
	rendered.Blocks = rendered.Blocks[:1]
	_, err = domain.BuildStudentAppAITutorResultArchiveLearningActions(
		normalizedResultArchiveInput(),
		rendered,
	)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func normalizedResultArchiveInput() domain.NormalizedReadStudentAppArchiveItemInput {
	return domain.NormalizedReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_student_ai_tutor_result_001",
		StudentID:     "student_001",
	}
}
