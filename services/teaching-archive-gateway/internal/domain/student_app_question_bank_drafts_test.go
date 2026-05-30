package domain_test

import (
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeListStudentAppQuestionBankDraftsScopesOwnSucceededDrafts(t *testing.T) {
	query, err := domain.NormalizeListStudentAppQuestionBankDraftsInput(domain.ListStudentAppQuestionBankDraftsInput{
		Principal: studentPrincipal("student_001"),
		PageSize:  20,
	})
	if err != nil {
		t.Fatalf("NormalizeListStudentAppQuestionBankDraftsInput returned error: %v", err)
	}
	if query.SourceArchiveOwnerType != domain.OwnerTypeStudent {
		t.Fatalf("SourceArchiveOwnerType = %q", query.SourceArchiveOwnerType)
	}
	if query.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", query.StudentID)
	}
	if query.Status != domain.TutoringAnalysisStatusSucceeded {
		t.Fatalf("Status = %q", query.Status)
	}
	if !query.RequireQuestionBankDraftRef {
		t.Fatalf("RequireQuestionBankDraftRef = false, want true")
	}
	if query.FetchLimit != 21 {
		t.Fatalf("FetchLimit = %d", query.FetchLimit)
	}
}

func TestNormalizeListStudentAppQuestionBankDraftsRejectsNonStudentAppPrincipals(t *testing.T) {
	studentWithoutOwnRead := studentPrincipal("student_001")
	studentWithoutOwnRead.Scopes = []domain.Scope{domain.ScopeTeachingRead}

	for name, principal := range map[string]domain.PrincipalContext{
		"teacher desktop":  teacherPrincipal(),
		"remote social":    remoteSocialPrincipal(),
		"service":          servicePrincipal(),
		"missing own read": studentWithoutOwnRead,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeListStudentAppQuestionBankDraftsInput(domain.ListStudentAppQuestionBankDraftsInput{
				Principal: principal,
			})
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
		})
	}
}
