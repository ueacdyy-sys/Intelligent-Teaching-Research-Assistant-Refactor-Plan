package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestSubmitTeachingQuizDraftIntentRecordsReviewOnlyCommand(t *testing.T) {
	port := &fakeTeachingDraftCommandPort{}
	now := time.Date(2026, 6, 4, 16, 0, 0, 0, time.UTC)
	uc := usecase.NewSubmitTeachingQuizDraftIntent(
		port,
		fixedIDs{id: "quiz_draft_intent_fixed"},
		fixedClock{now: now},
	)

	result, err := uc.ExecuteWithPersistence(context.Background(), validTeachingQuizDraftIntentInput(teacherPrincipal()))
	if err != nil {
		t.Fatalf("ExecuteWithPersistence returned error: %v", err)
	}

	if result.Intent.ID != "quiz_draft_intent_fixed" {
		t.Fatalf("ID = %q", result.Intent.ID)
	}
	if result.Intent.Status != domain.TeachingQuizDraftIntentReviewRequired {
		t.Fatalf("Status = %q", result.Intent.Status)
	}
	if result.Persistence.Status != usecase.PersistenceStatusAccepted {
		t.Fatalf("Persistence = %#v", result.Persistence)
	}
	if result.Persistence.CommandID != "cmd_quiz_draft_intent_fixed" {
		t.Fatalf("CommandID = %q", result.Persistence.CommandID)
	}
	if port.submits != 1 {
		t.Fatalf("submits = %d", port.submits)
	}
	if port.intent.CreatedAt != now {
		t.Fatalf("CreatedAt = %s", port.intent.CreatedAt)
	}
}

func TestSubmitTeachingQuizDraftIntentRejectsStudentPrincipalBeforeCommandPort(t *testing.T) {
	port := &fakeTeachingDraftCommandPort{}
	uc := usecase.NewSubmitTeachingQuizDraftIntent(
		port,
		fixedIDs{id: "quiz_draft_intent_fixed"},
		fixedClock{},
	)

	_, err := uc.Execute(context.Background(), validTeachingQuizDraftIntentInput(studentPrincipal("student_001")))

	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if port.submits != 0 {
		t.Fatalf("submits = %d", port.submits)
	}
}

func TestSubmitTeachingQuizDraftIntentRequiresServerIDPrefix(t *testing.T) {
	uc := usecase.NewSubmitTeachingQuizDraftIntent(
		&fakeTeachingDraftCommandPort{},
		fixedIDs{id: "bad_id"},
		fixedClock{},
	)

	_, err := uc.Execute(context.Background(), validTeachingQuizDraftIntentInput(teacherPrincipal()))

	if err == nil {
		t.Fatal("expected generated id prefix validation error")
	}
}

type fakeTeachingDraftCommandPort struct {
	intent                 domain.TeachingQuizDraftIntent
	archiveMaterialIntent  domain.TeachingArchiveMaterialDraftIntent
	submits                int
	archiveMaterialSubmits int
}

func (f *fakeTeachingDraftCommandPort) SubmitQuizDraftIntent(
	_ context.Context,
	intent domain.TeachingQuizDraftIntent,
) (usecase.WritePersistenceOutcome, error) {
	f.intent = intent
	f.submits++
	return usecase.AcceptedWriteOutcome("cmd_" + intent.ID), nil
}

func (f *fakeTeachingDraftCommandPort) SubmitArchiveMaterialDraftIntent(
	_ context.Context,
	intent domain.TeachingArchiveMaterialDraftIntent,
) (usecase.WritePersistenceOutcome, error) {
	f.archiveMaterialIntent = intent
	f.archiveMaterialSubmits++
	return usecase.AcceptedWriteOutcome("cmd_" + intent.ID), nil
}

func validTeachingQuizDraftIntentInput(
	principal domain.PrincipalContext,
) domain.SubmitTeachingQuizDraftIntentInput {
	return domain.SubmitTeachingQuizDraftIntentInput{
		Principal:           principal,
		Title:               "Week 3 fractions check",
		SourceMaterialRefs:  []string{"tarch_lesson_001"},
		LearningObjectives:  []string{"compare fractions"},
		QuestionCount:       10,
		Difficulty:          domain.TeachingQuizDraftDifficultyMedium,
		SharedContextRef:    "shared-context://agent-task-001",
		GuardrailResultRef:  "guardrail://agent-task-001",
		RouteDecisionRef:    "route://agent-task-001",
		InputHash:           "sha256:abc123",
		OutputSummary:       "review-only quiz draft intent",
		ApprovalArtifactRef: "approval://agent-task-001",
		RollbackPlanRef:     "rollback://agent-task-001",
		AuditTraceRef:       "audit://agent-task-001",
		IdempotencyKey:      "teaching-quiz-draft:week-3",
	}
}
