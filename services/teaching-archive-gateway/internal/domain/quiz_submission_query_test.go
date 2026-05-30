package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestScopeListQuizSubmissionsConstrainsStudentToOwnSubmissions(t *testing.T) {
	query, err := domain.NormalizeListQuizSubmissionsInput(domain.ListQuizSubmissionsInput{
		Principal:         studentPrincipal("student_001"),
		QuizArchiveItemID: " tarch_quiz_001 ",
		PageSize:          20,
	})
	if err != nil {
		t.Fatalf("NormalizeListQuizSubmissionsInput returned error: %v", err)
	}

	scoped, err := domain.ScopeListQuizSubmissions(
		studentPrincipal("student_001"),
		teachingQuizArchiveItem("tarch_quiz_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		query,
	)
	if err != nil {
		t.Fatalf("ScopeListQuizSubmissions returned error: %v", err)
	}

	if scoped.QuizArchiveItemID != "tarch_quiz_001" {
		t.Fatalf("QuizArchiveItemID = %q", scoped.QuizArchiveItemID)
	}
	if scoped.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", scoped.StudentID)
	}
	if len(scoped.StudentIDs) != 0 {
		t.Fatalf("StudentIDs = %#v", scoped.StudentIDs)
	}
}

func TestScopeListQuizSubmissionsConstrainsAssignedTeacherStudents(t *testing.T) {
	query, err := domain.NormalizeListQuizSubmissionsInput(domain.ListQuizSubmissionsInput{
		Principal:         teacherPrincipalForQuiz("student_001", "student_002"),
		QuizArchiveItemID: "tarch_quiz_001",
		PageSize:          20,
	})
	if err != nil {
		t.Fatalf("NormalizeListQuizSubmissionsInput returned error: %v", err)
	}

	scoped, err := domain.ScopeListQuizSubmissions(
		teacherPrincipalForQuiz("student_001", "student_002"),
		teachingQuizArchiveItem("tarch_quiz_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		query,
	)
	if err != nil {
		t.Fatalf("ScopeListQuizSubmissions returned error: %v", err)
	}

	if scoped.StudentID != "" {
		t.Fatalf("StudentID = %q", scoped.StudentID)
	}
	if len(scoped.StudentIDs) != 2 || scoped.StudentIDs[0] != "student_001" || scoped.StudentIDs[1] != "student_002" {
		t.Fatalf("StudentIDs = %#v", scoped.StudentIDs)
	}
}

func TestScopeListQuizSubmissionsAllowsAdminAllStudents(t *testing.T) {
	query, err := domain.NormalizeListQuizSubmissionsInput(domain.ListQuizSubmissionsInput{
		Principal:         adminPrincipalForQuiz(),
		QuizArchiveItemID: "tarch_quiz_001",
		StudentID:         "student_999",
		PageSize:          20,
	})
	if err != nil {
		t.Fatalf("NormalizeListQuizSubmissionsInput returned error: %v", err)
	}

	scoped, err := domain.ScopeListQuizSubmissions(
		adminPrincipalForQuiz(),
		teachingQuizArchiveItem("tarch_quiz_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		query,
	)
	if err != nil {
		t.Fatalf("ScopeListQuizSubmissions returned error: %v", err)
	}

	if scoped.StudentID != "student_999" {
		t.Fatalf("StudentID = %q", scoped.StudentID)
	}
}

func TestScopeListQuizSubmissionsRejectsNonQuizArchive(t *testing.T) {
	item := teachingQuizArchiveItem("tarch_quiz_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC))
	item.MaterialType = domain.MaterialTypeHandout

	_, err := domain.ScopeListQuizSubmissions(
		teacherPrincipalForQuiz("student_001"),
		item,
		domain.QuizSubmissionQuery{QuizArchiveItemID: "tarch_quiz_001", PageSize: 20, FetchLimit: 21},
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestBuildQuizSubmissionPageReturnsStableCursor(t *testing.T) {
	rows := []domain.QuizSubmission{
		quizSubmission("quiz_sub_2", "student_001", time.Date(2026, 5, 30, 10, 2, 0, 0, time.UTC)),
		quizSubmission("quiz_sub_1", "student_001", time.Date(2026, 5, 30, 10, 1, 0, 0, time.UTC)),
	}

	page, err := domain.BuildQuizSubmissionPage(rows, 1)
	if err != nil {
		t.Fatalf("BuildQuizSubmissionPage returned error: %v", err)
	}

	if len(page.Items) != 1 || page.Items[0].ID != "quiz_sub_2" {
		t.Fatalf("items = %#v", page.Items)
	}
	if !page.PageInfo.HasMore {
		t.Fatalf("HasMore = false")
	}
	if page.PageInfo.NextCursor == "" {
		t.Fatalf("NextCursor is empty")
	}

	decoded, err := domain.DecodeQuizSubmissionCursor(page.PageInfo.NextCursor)
	if err != nil {
		t.Fatalf("DecodeQuizSubmissionCursor returned error: %v", err)
	}
	if decoded.ID != "quiz_sub_2" {
		t.Fatalf("cursor ID = %q", decoded.ID)
	}
}

func quizSubmission(id string, studentID string, submittedAt time.Time) domain.QuizSubmission {
	return domain.QuizSubmission{
		ID:                     id,
		QuizArchiveItemID:      "tarch_quiz_001",
		StudentID:              studentID,
		SubmittedByPrincipalID: studentID,
		AnswerRef:              "local://answers/" + studentID + "/" + id + ".json",
		Status:                 domain.QuizSubmissionStatusSubmitted,
		SubmittedAt:            submittedAt,
	}
}
