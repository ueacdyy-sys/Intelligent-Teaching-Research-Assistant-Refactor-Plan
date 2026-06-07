package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestSubmitTeachingArchiveMaterialDraftIntentRecordsReviewOnlyCommand(t *testing.T) {
	port := &fakeTeachingDraftCommandPort{}
	now := time.Date(2026, 6, 4, 17, 30, 0, 0, time.UTC)
	uc := usecase.NewSubmitTeachingArchiveMaterialDraftIntent(
		port,
		fixedIDs{id: "archive_material_draft_intent_fixed"},
		fixedClock{now: now},
	)

	result, err := uc.ExecuteWithPersistence(
		context.Background(),
		validTeachingArchiveMaterialDraftIntentInput(teacherPrincipal()),
	)
	if err != nil {
		t.Fatalf("ExecuteWithPersistence returned error: %v", err)
	}

	if result.Intent.ID != "archive_material_draft_intent_fixed" {
		t.Fatalf("ID = %q", result.Intent.ID)
	}
	if result.Intent.Status != domain.TeachingArchiveMaterialDraftIntentReviewRequired {
		t.Fatalf("Status = %q", result.Intent.Status)
	}
	if result.Persistence.Status != usecase.PersistenceStatusAccepted {
		t.Fatalf("Persistence = %#v", result.Persistence)
	}
	if result.Persistence.CommandID != "cmd_archive_material_draft_intent_fixed" {
		t.Fatalf("CommandID = %q", result.Persistence.CommandID)
	}
	if port.archiveMaterialSubmits != 1 {
		t.Fatalf("archiveMaterialSubmits = %d", port.archiveMaterialSubmits)
	}
	if port.archiveMaterialIntent.CreatedAt != now {
		t.Fatalf("CreatedAt = %s", port.archiveMaterialIntent.CreatedAt)
	}
}

func TestSubmitTeachingArchiveMaterialDraftIntentRejectsStudentPrincipalBeforeCommandPort(t *testing.T) {
	port := &fakeTeachingDraftCommandPort{}
	uc := usecase.NewSubmitTeachingArchiveMaterialDraftIntent(
		port,
		fixedIDs{id: "archive_material_draft_intent_fixed"},
		fixedClock{},
	)

	_, err := uc.Execute(
		context.Background(),
		validTeachingArchiveMaterialDraftIntentInput(studentPrincipal("student_001")),
	)

	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if port.archiveMaterialSubmits != 0 {
		t.Fatalf("archiveMaterialSubmits = %d", port.archiveMaterialSubmits)
	}
}

func TestSubmitTeachingArchiveMaterialDraftIntentRequiresServerIDPrefix(t *testing.T) {
	uc := usecase.NewSubmitTeachingArchiveMaterialDraftIntent(
		&fakeTeachingDraftCommandPort{},
		fixedIDs{id: "bad_id"},
		fixedClock{},
	)

	_, err := uc.Execute(context.Background(), validTeachingArchiveMaterialDraftIntentInput(teacherPrincipal()))

	if err == nil {
		t.Fatal("expected generated id prefix validation error")
	}
}

func validTeachingArchiveMaterialDraftIntentInput(
	principal domain.PrincipalContext,
) domain.SubmitTeachingArchiveMaterialDraftIntentInput {
	return domain.SubmitTeachingArchiveMaterialDraftIntentInput{
		Principal:           principal,
		OwnerType:           domain.OwnerTypeStudent,
		StudentID:           "student_001",
		MaterialType:        domain.MaterialTypeHandout,
		Title:               "Student fraction portfolio packet",
		Source:              domain.SourceTeacherUpload,
		SourceRefs:          []string{"tarch_quiz_001"},
		DraftArtifactRef:    "draft://archive-material/student_001/fractions-packet",
		Tags:                []string{"fractions"},
		AnalysisIntents:     []domain.AnalysisIntent{domain.AnalysisIntentTutoring},
		SharedContextRef:    "shared-context://agent-task-archive-material-001",
		GuardrailResultRef:  "guardrail://agent-task-archive-material-001",
		RouteDecisionRef:    "route://agent-task-archive-material-001",
		InputHash:           "sha256:archive123",
		OutputSummary:       "review-only archive material draft intent",
		ApprovalArtifactRef: "approval://agent-task-archive-material-001",
		RollbackPlanRef:     "rollback://agent-task-archive-material-001",
		AuditTraceRef:       "audit://agent-task-archive-material-001",
		IdempotencyKey:      "archive-material-draft:student_001:fractions",
	}
}
