package domain_test

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNewTeachingArchiveMaterialDraftIntentNormalizesEvidenceAndLocksReviewOnlyStatus(t *testing.T) {
	intent, err := domain.NewTeachingArchiveMaterialDraftIntent(
		"archive_material_draft_intent_fixed",
		validArchiveMaterialDraftIntentInput(teacherPrincipal()),
		time.Date(2026, 6, 4, 17, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("NewTeachingArchiveMaterialDraftIntent returned error: %v", err)
	}

	if intent.Title != "Student fraction portfolio packet" {
		t.Fatalf("Title = %q", intent.Title)
	}
	if intent.OwnerType != domain.OwnerTypeStudent || intent.StudentID != "student_001" {
		t.Fatalf("owner evidence = %#v", intent)
	}
	if intent.MaterialType != domain.MaterialTypeHandout {
		t.Fatalf("MaterialType = %q", intent.MaterialType)
	}
	if !reflect.DeepEqual(intent.SourceRefs, []string{"tarch_quiz_001", "local://teacher/notes/fractions.md"}) {
		t.Fatalf("SourceRefs = %#v", intent.SourceRefs)
	}
	if intent.DraftArtifactRef != "draft://archive-material/student_001/fractions-packet" {
		t.Fatalf("DraftArtifactRef = %q", intent.DraftArtifactRef)
	}
	if intent.Status != domain.TeachingArchiveMaterialDraftIntentReviewRequired {
		t.Fatalf("Status = %q", intent.Status)
	}
	if !intent.ApprovalRequired {
		t.Fatalf("ApprovalRequired = false")
	}
	if intent.EventType != domain.TeachingArchiveMaterialDraftIntentReviewRequiredEvent {
		t.Fatalf("EventType = %q", intent.EventType)
	}
	if intent.RequestedByPrincipalID != "teacher_001" || intent.SessionID != "sess_teacher" {
		t.Fatalf("principal evidence missing: %#v", intent)
	}
}

func TestNormalizeSubmitTeachingArchiveMaterialDraftIntentRequiresReviewArtifact(t *testing.T) {
	input := validArchiveMaterialDraftIntentInput(teacherPrincipal())
	input.ApprovalArtifactRef = " "

	_, err := domain.NormalizeSubmitTeachingArchiveMaterialDraftIntentInput(input)

	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestNormalizeSubmitTeachingArchiveMaterialDraftIntentRequiresStudentIDForStudentDraft(t *testing.T) {
	input := validArchiveMaterialDraftIntentInput(teacherPrincipal())
	input.StudentID = " "

	_, err := domain.NormalizeSubmitTeachingArchiveMaterialDraftIntentInput(input)

	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestAuthorizeSubmitTeachingArchiveMaterialDraftIntentAllowsRemoteOnlyWhenHarnessGated(t *testing.T) {
	remote := domain.PrincipalContext{
		PrincipalID:             "remote:WECHAT:openid",
		SubjectType:             domain.SubjectRemoteChannel,
		Role:                    domain.RoleRemoteOperator,
		EntryPoint:              domain.EntryPointRemoteSocial,
		Scopes:                  []domain.Scope{domain.ScopeAgentCommandSubmit},
		KnowledgeAccess:         domain.KnowledgeAccess{Private: domain.PrivateAccessNone},
		StudentAccess:           domain.StudentAccess{Mode: domain.StudentAccessNone},
		RequiresHarnessApproval: true,
		SessionID:               "grant_remote",
		IssuedAt:                time.Now().Add(-time.Minute).UTC(),
		ExpiresAt:               time.Now().Add(time.Hour).UTC(),
	}
	if err := domain.AuthorizeSubmitTeachingArchiveMaterialDraftIntent(remote); err != nil {
		t.Fatalf("harness-gated remote submit error: %v", err)
	}

	remote.RequiresHarnessApproval = false
	err := domain.AuthorizeSubmitTeachingArchiveMaterialDraftIntent(remote)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("remote without harness approval error = %v, want ErrForbidden", err)
	}
}

func TestAuthorizeSubmitTeachingArchiveMaterialDraftIntentRejectsStudentPrincipal(t *testing.T) {
	err := domain.AuthorizeSubmitTeachingArchiveMaterialDraftIntent(studentPrincipal("student_001"))

	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestNewTeachingArchiveMaterialDraftIntentRequiresServerIDPrefix(t *testing.T) {
	_, err := domain.NewTeachingArchiveMaterialDraftIntent(
		"bad_id",
		validArchiveMaterialDraftIntentInput(teacherPrincipal()),
		time.Date(2026, 6, 4, 17, 0, 0, 0, time.UTC),
	)

	if err == nil {
		t.Fatal("expected generated id prefix validation error")
	}
}

func validArchiveMaterialDraftIntentInput(
	principal domain.PrincipalContext,
) domain.SubmitTeachingArchiveMaterialDraftIntentInput {
	return domain.SubmitTeachingArchiveMaterialDraftIntentInput{
		Principal:           principal,
		OwnerType:           domain.OwnerTypeStudent,
		StudentID:           " student_001 ",
		MaterialType:        domain.MaterialTypeHandout,
		Title:               "  Student fraction portfolio packet  ",
		Source:              domain.SourceTeacherUpload,
		SourceRefs:          []string{" tarch_quiz_001 ", " local://teacher/notes/fractions.md "},
		DraftArtifactRef:    " draft://archive-material/student_001/fractions-packet ",
		Tags:                []string{" fractions ", " portfolio "},
		AnalysisIntents:     []domain.AnalysisIntent{domain.AnalysisIntentTutoring},
		SharedContextRef:    " shared-context://agent-task-archive-material-001 ",
		GuardrailResultRef:  " guardrail://agent-task-archive-material-001 ",
		RouteDecisionRef:    " route://agent-task-archive-material-001 ",
		InputHash:           " sha256:archive123 ",
		OutputSummary:       " archive material draft only; no final archive item created ",
		ApprovalArtifactRef: " approval://agent-task-archive-material-001 ",
		RollbackPlanRef:     " rollback://agent-task-archive-material-001 ",
		AuditTraceRef:       " audit://agent-task-archive-material-001 ",
		IdempotencyKey:      " archive-material-draft:student_001:fractions ",
	}
}
