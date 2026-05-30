package domain_test

import (
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestResolveQuizScanCodeNormalizesTeachingQuizPayload(t *testing.T) {
	archiveItemID, err := domain.ResolveQuizScanCode(" teaching-quiz:tarch_quiz_001 ")
	if err != nil {
		t.Fatalf("ResolveQuizScanCode returned error: %v", err)
	}
	if archiveItemID != "tarch_quiz_001" {
		t.Fatalf("archiveItemID = %q", archiveItemID)
	}
}

func TestResolveQuizScanCodeRejectsUnknownSchemeAndMissingID(t *testing.T) {
	for name, scanCode := range map[string]string{
		"unknown scheme": "attendance:tarch_quiz_001",
		"missing id":     "teaching-quiz:",
	} {
		_, err := domain.ResolveQuizScanCode(scanCode)
		if !errors.Is(err, domain.ErrValidation) {
			t.Fatalf("%s error = %v, want ErrValidation", name, err)
		}
	}
}

func TestNormalizeCreateScannedQuizSubmissionUsesStudentOwnIdentity(t *testing.T) {
	input, err := domain.NormalizeCreateScannedQuizSubmissionInput(domain.CreateScannedQuizSubmissionInput{
		Principal: studentPrincipal("student_001"),
		ScanCode:  " teaching-quiz:tarch_quiz_001 ",
		AnswerRef: " local://answers/student_001/week-3.json ",
	})
	if err != nil {
		t.Fatalf("NormalizeCreateScannedQuizSubmissionInput returned error: %v", err)
	}
	if input.QuizArchiveItemID != "tarch_quiz_001" {
		t.Fatalf("QuizArchiveItemID = %q", input.QuizArchiveItemID)
	}
	if input.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", input.StudentID)
	}
	if input.AnswerRef != "local://answers/student_001/week-3.json" {
		t.Fatalf("AnswerRef = %q", input.AnswerRef)
	}
}

func TestNormalizeCreateScannedQuizSubmissionRejectsTeacherPrincipal(t *testing.T) {
	_, err := domain.NormalizeCreateScannedQuizSubmissionInput(domain.CreateScannedQuizSubmissionInput{
		Principal: teacherPrincipal(),
		ScanCode:  "teaching-quiz:tarch_quiz_001",
		AnswerRef: "local://answers/student_001/week-3.json",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}
