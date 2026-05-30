package domain_test

import (
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeListStudentAppQuizSubmissionsScopesOwnStudent(t *testing.T) {
	query, err := domain.NormalizeListStudentAppQuizSubmissionsInput(domain.ListStudentAppQuizSubmissionsInput{
		Principal:         studentPrincipal("student_001"),
		QuizArchiveItemID: " tarch_week_3 ",
		PageSize:          25,
	})
	if err != nil {
		t.Fatalf("NormalizeListStudentAppQuizSubmissionsInput returned error: %v", err)
	}
	if query.QuizArchiveItemID != "tarch_week_3" {
		t.Fatalf("QuizArchiveItemID = %q", query.QuizArchiveItemID)
	}
	if query.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", query.StudentID)
	}
	if len(query.StudentIDs) != 0 {
		t.Fatalf("StudentIDs = %#v", query.StudentIDs)
	}
	if query.FetchLimit != 26 {
		t.Fatalf("FetchLimit = %d", query.FetchLimit)
	}
}

func TestNormalizeListStudentAppQuizSubmissionsAllowsOwnRowsWithoutQuizFilter(t *testing.T) {
	query, err := domain.NormalizeListStudentAppQuizSubmissionsInput(domain.ListStudentAppQuizSubmissionsInput{
		Principal: studentPrincipal("student_001"),
		PageSize:  10,
	})
	if err != nil {
		t.Fatalf("NormalizeListStudentAppQuizSubmissionsInput returned error: %v", err)
	}
	if query.QuizArchiveItemID != "" {
		t.Fatalf("QuizArchiveItemID = %q", query.QuizArchiveItemID)
	}
	if query.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", query.StudentID)
	}
}

func TestNormalizeListStudentAppQuizSubmissionsRejectsNonStudentAppPrincipals(t *testing.T) {
	studentWithoutOwnRead := studentPrincipal("student_001")
	studentWithoutOwnRead.Scopes = []domain.Scope{domain.ScopeTeachingRead}

	for name, principal := range map[string]domain.PrincipalContext{
		"teacher desktop":  teacherPrincipal(),
		"remote social":    remoteSocialPrincipal(),
		"service":          servicePrincipal(),
		"missing own read": studentWithoutOwnRead,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeListStudentAppQuizSubmissionsInput(domain.ListStudentAppQuizSubmissionsInput{
				Principal: principal,
			})
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
		})
	}
}
