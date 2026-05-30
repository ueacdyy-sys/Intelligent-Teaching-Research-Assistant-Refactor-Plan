package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestListStudentAppQuizSubmissionsScopesOwnStudentBeforeRepository(t *testing.T) {
	repo := &fakeQuizSubmissionRepository{
		submissions: []domain.QuizSubmission{
			usecaseQuizSubmission("quiz_sub_2", "student_001", time.Date(2026, 5, 30, 10, 2, 0, 0, time.UTC)),
			usecaseQuizSubmission("quiz_sub_1", "student_001", time.Date(2026, 5, 30, 10, 1, 0, 0, time.UTC)),
			usecaseQuizSubmission("quiz_sub_other", "student_002", time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewListStudentAppQuizSubmissions(repo)

	page, err := uc.Execute(context.Background(), domain.ListStudentAppQuizSubmissionsInput{
		Principal:         studentPrincipal("student_001"),
		QuizArchiveItemID: "tarch_quiz",
		PageSize:          1,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if repo.listQuery.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", repo.listQuery.StudentID)
	}
	if repo.listQuery.QuizArchiveItemID != "tarch_quiz" {
		t.Fatalf("QuizArchiveItemID = %q", repo.listQuery.QuizArchiveItemID)
	}
	if repo.listQuery.FetchLimit != 2 {
		t.Fatalf("FetchLimit = %d", repo.listQuery.FetchLimit)
	}
	if len(page.Items) != 1 || page.Items[0].ID != "quiz_sub_2" {
		t.Fatalf("items = %#v", page.Items)
	}
	if !page.PageInfo.HasMore {
		t.Fatalf("HasMore = false, want true")
	}
}

func TestListStudentAppQuizSubmissionsRejectsForbiddenWithoutRepositoryRead(t *testing.T) {
	repo := &fakeQuizSubmissionRepository{}
	uc := usecase.NewListStudentAppQuizSubmissions(repo)

	_, err := uc.Execute(context.Background(), domain.ListStudentAppQuizSubmissionsInput{
		Principal: remotePrincipal(),
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.lists != 0 {
		t.Fatalf("lists = %d, want 0", repo.lists)
	}
}
