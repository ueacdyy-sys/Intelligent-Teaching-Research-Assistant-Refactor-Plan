package domain_test

import (
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeCreateStudentAppAITutorRequestDefaultsPersonalizedQuestionBank(t *testing.T) {
	normalized, err := domain.NormalizeCreateStudentAppAITutorRequestInput(domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: " tarch_student_quiz ",
		AnalysisGoal:         "  explain weak algebra skills  ",
	})
	if err != nil {
		t.Fatalf("NormalizeCreateStudentAppAITutorRequestInput returned error: %v", err)
	}
	if normalized.ArchiveItemID != "tarch_student_quiz" {
		t.Fatalf("ArchiveItemID = %q", normalized.ArchiveItemID)
	}
	if normalized.AnalysisGoal != "explain weak algebra skills" {
		t.Fatalf("AnalysisGoal = %q", normalized.AnalysisGoal)
	}
	if normalized.QuestionBankIntent != domain.QuestionBankIntentGeneratePersonalizedCheck {
		t.Fatalf("QuestionBankIntent = %q", normalized.QuestionBankIntent)
	}
}

func TestNormalizeCreateStudentAppAITutorRequestRejectsUnsupportedQuestionBankIntent(t *testing.T) {
	_, err := domain.NormalizeCreateStudentAppAITutorRequestInput(domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: "tarch_student_quiz",
		AnalysisGoal:         "explain weak skills",
		QuestionBankIntent:   domain.QuestionBankIntent("EXPORT_FULL_BANK"),
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestNormalizeCreateStudentAppAITutorRequestRejectsNonStudentAppPrincipals(t *testing.T) {
	studentWithoutTeachingRead := studentPrincipal("student_001")
	studentWithoutTeachingRead.Scopes = []domain.Scope{domain.ScopeStudentOwnRead}

	studentWithoutOwnRead := studentPrincipal("student_001")
	studentWithoutOwnRead.Scopes = []domain.Scope{domain.ScopeTeachingRead}

	for name, principal := range map[string]domain.PrincipalContext{
		"teacher desktop":       teacherPrincipal(),
		"remote social":         remoteSocialPrincipal(),
		"service":               servicePrincipal(),
		"missing teaching read": studentWithoutTeachingRead,
		"missing own read":      studentWithoutOwnRead,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeCreateStudentAppAITutorRequestInput(domain.CreateStudentAppAITutorRequestInput{
				Principal:            principal,
				StudentArchiveItemID: "tarch_student_quiz",
				AnalysisGoal:         "explain weak skills",
			})
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
		})
	}
}
