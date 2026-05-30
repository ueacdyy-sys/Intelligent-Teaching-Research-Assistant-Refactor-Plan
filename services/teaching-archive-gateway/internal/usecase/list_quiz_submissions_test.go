package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestListQuizSubmissionsFetchesQuizBeforeListing(t *testing.T) {
	repo := &fakeQuizSubmissionRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_quiz": teachingQuizItem("tarch_quiz", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		},
		submissions: []domain.QuizSubmission{
			usecaseQuizSubmission("quiz_sub_2", "student_001", time.Date(2026, 5, 30, 10, 2, 0, 0, time.UTC)),
			usecaseQuizSubmission("quiz_sub_other", "student_002", time.Date(2026, 5, 30, 10, 1, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewListQuizSubmissions(repo)

	page, err := uc.Execute(context.Background(), domain.ListQuizSubmissionsInput{
		Principal:         studentPrincipal("student_001"),
		QuizArchiveItemID: " tarch_quiz ",
		PageSize:          10,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if repo.gets != 1 {
		t.Fatalf("gets = %d, want 1", repo.gets)
	}
	if repo.lists != 1 {
		t.Fatalf("lists = %d, want 1", repo.lists)
	}
	if repo.listQuery.QuizArchiveItemID != "tarch_quiz" {
		t.Fatalf("QuizArchiveItemID = %q", repo.listQuery.QuizArchiveItemID)
	}
	if repo.listQuery.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", repo.listQuery.StudentID)
	}
	if len(page.Items) != 1 || page.Items[0].StudentID != "student_001" {
		t.Fatalf("items = %#v", page.Items)
	}
}

func TestListQuizSubmissionsReturnsNotFoundBeforeList(t *testing.T) {
	repo := &fakeQuizSubmissionRepository{items: map[string]domain.ArchiveItem{}}
	uc := usecase.NewListQuizSubmissions(repo)

	_, err := uc.Execute(context.Background(), domain.ListQuizSubmissionsInput{
		Principal:         studentPrincipal("student_001"),
		QuizArchiveItemID: "tarch_missing",
		PageSize:          10,
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
	if repo.gets != 1 {
		t.Fatalf("gets = %d, want 1", repo.gets)
	}
	if repo.lists != 0 {
		t.Fatalf("lists = %d, want 0", repo.lists)
	}
}

func usecaseQuizSubmission(id string, studentID string, submittedAt time.Time) domain.QuizSubmission {
	return domain.QuizSubmission{
		ID:                     id,
		QuizArchiveItemID:      "tarch_quiz",
		StudentID:              studentID,
		SubmittedByPrincipalID: studentID,
		AnswerRef:              "local://answers/" + studentID + "/" + id + ".json",
		Status:                 domain.QuizSubmissionStatusSubmitted,
		SubmittedAt:            submittedAt,
	}
}
