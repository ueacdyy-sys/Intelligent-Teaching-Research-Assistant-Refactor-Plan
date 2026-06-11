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

func TestNormalizeReadStudentAppQuestionBankDraftSummaryScopesOwnDrafts(t *testing.T) {
	query, err := domain.NormalizeReadStudentAppQuestionBankDraftSummaryInput(
		domain.ReadStudentAppQuestionBankDraftSummaryInput{
			Principal: studentPrincipal("student_001"),
		},
	)
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppQuestionBankDraftSummaryInput returned error: %v", err)
	}
	if query.Status != domain.TutoringAnalysisStatusSucceeded ||
		query.SourceArchiveOwnerType != domain.OwnerTypeStudent ||
		query.StudentID != "student_001" ||
		!query.RequireQuestionBankDraftRef ||
		query.FetchLimit != 0 {
		t.Fatalf("query = %#v", query)
	}
}

func TestNormalizeReadStudentAppQuestionBankDraftSummaryRejectsNonStudentAppPrincipals(t *testing.T) {
	_, err := domain.NormalizeReadStudentAppQuestionBankDraftSummaryInput(
		domain.ReadStudentAppQuestionBankDraftSummaryInput{
			Principal: remoteSocialPrincipal(),
		},
	)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestBuildStudentAppQuestionBankDraftSummaryMapsMaterialCounts(t *testing.T) {
	summary, err := domain.BuildStudentAppQuestionBankDraftSummary(map[domain.MaterialType]int{
		domain.MaterialTypeQuiz:     2,
		domain.MaterialTypePaper:    1,
		domain.MaterialTypeHandout:  3,
		domain.MaterialTypeHomework: 4,
	})
	if err != nil {
		t.Fatalf("BuildStudentAppQuestionBankDraftSummary returned error: %v", err)
	}
	if summary.TotalCount != 10 ||
		summary.QuizCount != 2 ||
		summary.PaperCount != 1 ||
		summary.HandoutCount != 3 ||
		summary.HomeworkCount != 4 {
		t.Fatalf("summary = %#v", summary)
	}
}

func TestBuildStudentAppQuestionBankDraftSummaryRejectsUnsafeCounts(t *testing.T) {
	for name, counts := range map[string]map[domain.MaterialType]int{
		"teaching material": {domain.MaterialTypeTeachingMaterial: 1},
		"negative":          {domain.MaterialTypeQuiz: -1},
		"unsupported":       {domain.MaterialType("NOTE"): 1},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.BuildStudentAppQuestionBankDraftSummary(counts)
			if err == nil {
				t.Fatal("expected error")
			}
		})
	}
}
