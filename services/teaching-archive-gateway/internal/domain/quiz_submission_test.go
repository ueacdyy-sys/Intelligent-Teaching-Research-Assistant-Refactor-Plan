package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNewQuizSubmissionNormalizesStudentAnswerMetadata(t *testing.T) {
	submittedAt := time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC)

	submission, err := domain.NewQuizSubmission(
		"quiz_sub_fixed",
		domain.CreateQuizSubmissionInput{
			Principal:         studentPrincipal("student_001"),
			QuizArchiveItemID: " tarch_quiz_001 ",
			AnswerRef:         " local://answers/student_001/week-3.json ",
		},
		submittedAt,
	)
	if err != nil {
		t.Fatalf("NewQuizSubmission returned error: %v", err)
	}

	if submission.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", submission.StudentID)
	}
	if submission.AnswerRef != "local://answers/student_001/week-3.json" {
		t.Fatalf("AnswerRef = %q", submission.AnswerRef)
	}
	if submission.Status != domain.QuizSubmissionStatusSubmitted {
		t.Fatalf("Status = %q", submission.Status)
	}
	if !submission.SubmittedAt.Equal(submittedAt) {
		t.Fatalf("SubmittedAt = %s", submission.SubmittedAt)
	}
}

func TestAuthorizeCreateQuizSubmissionAllowsTeacherAssignedStudent(t *testing.T) {
	err := domain.AuthorizeCreateQuizSubmission(
		teacherPrincipalForQuiz("student_001"),
		teachingQuizArchiveItem("tarch_quiz_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		"student_001",
	)
	if err != nil {
		t.Fatalf("AuthorizeCreateQuizSubmission returned error: %v", err)
	}
}

func TestAuthorizeCreateQuizSubmissionAllowsAdminAllStudent(t *testing.T) {
	err := domain.AuthorizeCreateQuizSubmission(
		adminPrincipalForQuiz(),
		teachingQuizArchiveItem("tarch_quiz_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		"student_999",
	)
	if err != nil {
		t.Fatalf("AuthorizeCreateQuizSubmission returned error: %v", err)
	}
}

func teacherPrincipalForQuiz(studentIDs ...string) domain.PrincipalContext {
	principal := teacherPrincipal()
	principal.StudentAccess.StudentIDs = append([]string(nil), studentIDs...)
	return principal
}

func adminPrincipalForQuiz() domain.PrincipalContext {
	principal := teacherPrincipal()
	principal.PrincipalID = "admin_001"
	principal.Role = domain.RoleAdmin
	principal.KnowledgeAccess.Private = domain.PrivateAccessAll
	principal.StudentAccess = domain.StudentAccess{Mode: domain.StudentAccessAll}
	return principal
}

func TestAuthorizeCreateQuizSubmissionRejectsStudentImpersonation(t *testing.T) {
	err := domain.AuthorizeCreateQuizSubmission(
		studentPrincipal("student_001"),
		teachingQuizArchiveItem("tarch_quiz_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		"student_002",
	)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestValidateQuizSubmissionArchiveRejectsStudentArchive(t *testing.T) {
	item := teachingQuizArchiveItem("tarch_quiz_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC))
	item.OwnerType = domain.OwnerTypeStudent
	item.StudentID = "student_001"

	err := domain.ValidateQuizSubmissionArchiveItem(item)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestValidateQuizSubmissionArchiveRejectsNonQuizArchive(t *testing.T) {
	item := teachingQuizArchiveItem("tarch_quiz_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC))
	item.MaterialType = domain.MaterialTypeHandout

	err := domain.ValidateQuizSubmissionArchiveItem(item)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func teachingQuizArchiveItem(id string, createdAt time.Time) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              id,
		OwnerType:       domain.OwnerTypeTeaching,
		MaterialType:    domain.MaterialTypeQuiz,
		Title:           "Week 3 Quiz",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://teaching/quizzes/week-3.pdf",
		Tags:            []string{"math"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
		OCRStatus:       domain.OCRStatusNotRequired,
		CreatedAt:       createdAt,
	}
}
