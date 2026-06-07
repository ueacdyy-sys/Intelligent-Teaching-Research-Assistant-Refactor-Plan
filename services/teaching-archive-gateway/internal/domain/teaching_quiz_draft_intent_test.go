package domain_test

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNewTeachingQuizDraftIntentNormalizesEvidenceAndLocksReviewOnlyStatus(t *testing.T) {
	intent, err := domain.NewTeachingQuizDraftIntent(
		"quiz_draft_intent_fixed",
		validQuizDraftIntentInput(teacherPrincipal()),
		time.Date(2026, 6, 4, 15, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("NewTeachingQuizDraftIntent returned error: %v", err)
	}

	if intent.Title != "Week 3 fractions check" {
		t.Fatalf("Title = %q", intent.Title)
	}
	if !reflect.DeepEqual(intent.SourceMaterialRefs, []string{"tarch_lesson_001", "local://lesson/week-3.pdf"}) {
		t.Fatalf("SourceMaterialRefs = %#v", intent.SourceMaterialRefs)
	}
	if !reflect.DeepEqual(intent.LearningObjectives, []string{"compare fractions", "simplify fractions"}) {
		t.Fatalf("LearningObjectives = %#v", intent.LearningObjectives)
	}
	if intent.Difficulty != domain.TeachingQuizDraftDifficultyMixed {
		t.Fatalf("Difficulty = %q", intent.Difficulty)
	}
	if intent.Status != domain.TeachingQuizDraftIntentReviewRequired {
		t.Fatalf("Status = %q", intent.Status)
	}
	if !intent.ApprovalRequired {
		t.Fatalf("ApprovalRequired = false")
	}
	if intent.EventType != domain.TeachingQuizDraftIntentReviewRequiredEvent {
		t.Fatalf("EventType = %q", intent.EventType)
	}
	if intent.RequestedByPrincipalID != "teacher_001" || intent.SessionID != "sess_teacher" {
		t.Fatalf("principal evidence missing: %#v", intent)
	}
}

func TestNormalizeSubmitTeachingQuizDraftIntentRequiresSafetyEvidence(t *testing.T) {
	input := validQuizDraftIntentInput(teacherPrincipal())
	input.RollbackPlanRef = " "

	_, err := domain.NormalizeSubmitTeachingQuizDraftIntentInput(input)

	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestAuthorizeSubmitTeachingQuizDraftIntentAllowsRemoteOnlyWhenHarnessGated(t *testing.T) {
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
	if err := domain.AuthorizeSubmitTeachingQuizDraftIntent(remote); err != nil {
		t.Fatalf("harness-gated remote submit error: %v", err)
	}

	remote.RequiresHarnessApproval = false
	err := domain.AuthorizeSubmitTeachingQuizDraftIntent(remote)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("remote without harness approval error = %v, want ErrForbidden", err)
	}
}

func TestAuthorizeSubmitTeachingQuizDraftIntentRejectsStudentPrincipal(t *testing.T) {
	err := domain.AuthorizeSubmitTeachingQuizDraftIntent(studentPrincipal("student_001"))

	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestNewTeachingQuizDraftIntentRequiresServerIDPrefix(t *testing.T) {
	_, err := domain.NewTeachingQuizDraftIntent(
		"bad_id",
		validQuizDraftIntentInput(teacherPrincipal()),
		time.Date(2026, 6, 4, 15, 0, 0, 0, time.UTC),
	)

	if err == nil {
		t.Fatal("expected generated id prefix validation error")
	}
}

func validQuizDraftIntentInput(principal domain.PrincipalContext) domain.SubmitTeachingQuizDraftIntentInput {
	return domain.SubmitTeachingQuizDraftIntentInput{
		Principal:           principal,
		Title:               "  Week 3 fractions check  ",
		SourceMaterialRefs:  []string{" tarch_lesson_001 ", " local://lesson/week-3.pdf "},
		LearningObjectives:  []string{" compare fractions ", " simplify fractions "},
		QuestionCount:       12,
		SharedContextRef:    " shared-context://agent-task-001 ",
		GuardrailResultRef:  " guardrail://agent-task-001 ",
		RouteDecisionRef:    " route://agent-task-001 ",
		InputHash:           " sha256:abc123 ",
		OutputSummary:       " draft quiz intent only; no generated final questions ",
		ApprovalArtifactRef: " approval://agent-task-001 ",
		RollbackPlanRef:     " rollback://agent-task-001 ",
		AuditTraceRef:       " audit://agent-task-001 ",
		IdempotencyKey:      " teaching-quiz-draft:week-3 ",
	}
}
