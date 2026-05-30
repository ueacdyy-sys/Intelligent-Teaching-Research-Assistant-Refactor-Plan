package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestCreateScannedQuizSubmissionCreatesOwnSubmissionFromScanCode(t *testing.T) {
	repo := &fakeQuizSubmissionRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_quiz": teachingQuizItem("tarch_quiz", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewCreateScannedQuizSubmission(
		repo,
		fixedIDs{id: "quiz_sub_scanned"},
		fixedClock{now: time.Date(2026, 5, 30, 10, 30, 0, 0, time.UTC)},
	)

	got, err := uc.Execute(context.Background(), domain.CreateScannedQuizSubmissionInput{
		Principal: studentPrincipal("student_001"),
		ScanCode:  " teaching-quiz:tarch_quiz ",
		AnswerRef: " local://answers/student_001/week-3.json ",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if got.ID != "quiz_sub_scanned" {
		t.Fatalf("ID = %q", got.ID)
	}
	if got.QuizArchiveItemID != "tarch_quiz" || got.StudentID != "student_001" {
		t.Fatalf("submission = %#v", got)
	}
	if repo.gets != 1 || repo.creates != 1 {
		t.Fatalf("repo gets=%d creates=%d, want 1/1", repo.gets, repo.creates)
	}
}

func TestCreateScannedQuizSubmissionRejectsTeacherBeforeRepositoryAccess(t *testing.T) {
	repo := &fakeQuizSubmissionRepository{}
	uc := usecase.NewCreateScannedQuizSubmission(repo, fixedIDs{id: "quiz_sub_scanned"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateScannedQuizSubmissionInput{
		Principal: teacherPrincipal(),
		ScanCode:  "teaching-quiz:tarch_quiz",
		AnswerRef: "local://answers/student_001/week-3.json",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.gets != 0 || repo.creates != 0 {
		t.Fatalf("repo gets=%d creates=%d, want 0/0", repo.gets, repo.creates)
	}
}

func TestCreateScannedQuizSubmissionReturnsNotFoundForMissingQuiz(t *testing.T) {
	repo := &fakeQuizSubmissionRepository{items: map[string]domain.ArchiveItem{}}
	uc := usecase.NewCreateScannedQuizSubmission(repo, fixedIDs{id: "quiz_sub_scanned"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateScannedQuizSubmissionInput{
		Principal: studentPrincipal("student_001"),
		ScanCode:  "teaching-quiz:tarch_missing",
		AnswerRef: "local://answers/student_001/week-3.json",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateScannedQuizSubmissionRejectsNonQuizArchive(t *testing.T) {
	item := teachingQuizItem("tarch_handout", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC))
	item.MaterialType = domain.MaterialTypeHandout
	repo := &fakeQuizSubmissionRepository{items: map[string]domain.ArchiveItem{"tarch_handout": item}}
	uc := usecase.NewCreateScannedQuizSubmission(repo, fixedIDs{id: "quiz_sub_scanned"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateScannedQuizSubmissionInput{
		Principal: studentPrincipal("student_001"),
		ScanCode:  "teaching-quiz:tarch_handout",
		AnswerRef: "local://answers/student_001/week-3.json",
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d", repo.creates)
	}
}
