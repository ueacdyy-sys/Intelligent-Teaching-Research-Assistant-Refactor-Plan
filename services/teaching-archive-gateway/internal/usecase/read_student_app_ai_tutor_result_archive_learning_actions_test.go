package usecase_test

import (
	"context"
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadStudentAppAITutorResultArchiveLearningActionsUsesSafeRenderer(t *testing.T) {
	rendered, err := domain.BuildStudentAppAITutorResultArchiveRenderEnvelope(aiTutorResultArchiveCard())
	if err != nil {
		t.Fatalf("BuildStudentAppAITutorResultArchiveRenderEnvelope returned error: %v", err)
	}
	renderer := &fakeAITutorResultArchiveRenderer{rendered: rendered}
	uc := usecase.NewReadStudentAppAITutorResultArchiveLearningActions(renderer)

	actions, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_student_ai_tutor_result_001",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if renderer.renders != 1 ||
		actions.Status != domain.StudentAppAITutorResultArchiveStatusReady ||
		actions.RenderFormat != domain.StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks ||
		len(actions.Actions) != 2 {
		t.Fatalf("renders=%d actions=%#v", renderer.renders, actions)
	}
	for _, action := range actions.Actions {
		if action.SourceType != domain.StudentAppAITutorLearningActionSourceResultArchive ||
			action.TargetEndpoint != "/v1/student-app/ai-tutor-requests" ||
			action.Method != "POST" {
			t.Fatalf("unsafe action source = %#v", action)
		}
	}
}

func TestReadStudentAppAITutorResultArchiveLearningActionsRejectsBeforeRendering(t *testing.T) {
	renderer := &fakeAITutorResultArchiveRenderer{}
	uc := usecase.NewReadStudentAppAITutorResultArchiveLearningActions(renderer)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     teacherPrincipal(),
		ArchiveItemID: "tarch_student_ai_tutor_result_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if renderer.renders != 0 {
		t.Fatalf("renders = %d, want 0", renderer.renders)
	}
}

func TestReadStudentAppAITutorResultArchiveLearningActionsPropagatesRendererBoundaryErrors(t *testing.T) {
	renderer := &fakeAITutorResultArchiveRenderer{err: domain.ErrNotFound}
	uc := usecase.NewReadStudentAppAITutorResultArchiveLearningActions(renderer)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_student_ai_tutor_result_001",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
	if renderer.renders != 1 {
		t.Fatalf("renders = %d, want 1", renderer.renders)
	}
}

type fakeAITutorResultArchiveRenderer struct {
	rendered domain.StudentAppAITutorResultArchiveRenderEnvelope
	err      error
	renders  int
}

func (f *fakeAITutorResultArchiveRenderer) Execute(
	_ context.Context,
	_ domain.ReadStudentAppArchiveItemInput,
) (domain.StudentAppAITutorResultArchiveRenderEnvelope, error) {
	f.renders++
	return f.rendered, f.err
}
