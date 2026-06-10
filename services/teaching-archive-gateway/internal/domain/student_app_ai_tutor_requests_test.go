package domain_test

import (
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeListStudentAppAITutorRequestsScopesOwnStudentRequests(t *testing.T) {
	query, err := domain.NormalizeListStudentAppAITutorRequestsInput(domain.ListStudentAppAITutorRequestsInput{
		Principal: studentPrincipal("student_001"),
		Status:    domain.TutoringAnalysisStatusSucceeded,
		PageSize:  20,
	})
	if err != nil {
		t.Fatalf("NormalizeListStudentAppAITutorRequestsInput returned error: %v", err)
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
	if query.FetchLimit != 21 {
		t.Fatalf("FetchLimit = %d", query.FetchLimit)
	}
}

func TestNormalizeListStudentAppAITutorRequestsRejectsNonStudentAppPrincipals(t *testing.T) {
	studentWithoutOwnRead := studentPrincipal("student_001")
	studentWithoutOwnRead.Scopes = []domain.Scope{domain.ScopeTeachingRead}

	for name, principal := range map[string]domain.PrincipalContext{
		"teacher desktop":  teacherPrincipal(),
		"remote social":    remoteSocialPrincipal(),
		"service":          servicePrincipal(),
		"missing own read": studentWithoutOwnRead,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeListStudentAppAITutorRequestsInput(domain.ListStudentAppAITutorRequestsInput{
				Principal: principal,
			})
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
		})
	}
}

func TestNormalizeReadStudentAppAITutorRequestProgressScopesOwnRequest(t *testing.T) {
	query, err := domain.NormalizeReadStudentAppAITutorRequestProgressInput(
		domain.ReadStudentAppAITutorRequestProgressInput{
			Principal: studentPrincipal("student_001"),
			RequestID: " tutor_req_progress_detail ",
		},
	)
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppAITutorRequestProgressInput returned error: %v", err)
	}
	if query.ID != "tutor_req_progress_detail" ||
		query.SourceArchiveOwnerType != domain.OwnerTypeStudent ||
		query.StudentID != "student_001" ||
		query.PageSize != 1 ||
		query.FetchLimit != 1 {
		t.Fatalf("query = %#v", query)
	}
}

func TestNormalizeReadStudentAppAITutorRequestProgressRejectsUnsafeRequestID(t *testing.T) {
	_, err := domain.NormalizeReadStudentAppAITutorRequestProgressInput(
		domain.ReadStudentAppAITutorRequestProgressInput{
			Principal: studentPrincipal("student_001"),
			RequestID: "grading_req_wrong",
		},
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}
