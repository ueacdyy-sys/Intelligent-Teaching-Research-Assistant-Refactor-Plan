package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestCreateQuizSubmissionAIGradingRequestCopiesQuizAndAnswerRefs(t *testing.T) {
	repo := &fakeQuizSubmissionRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_quiz": teachingQuizItem("tarch_quiz", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		},
		submissions: []domain.QuizSubmission{
			quizSubmissionForAIGrading("quiz_sub_week_3", "tarch_quiz", "student_001"),
		},
	}
	uc := usecase.NewCreateQuizSubmissionAIGradingRequest(
		repo,
		fixedIDs{id: "grading_req_submission"},
		fixedClock{now: time.Date(2026, 5, 30, 11, 0, 0, 0, time.UTC)},
	)

	got, err := uc.Execute(context.Background(), domain.CreateQuizSubmissionAIGradingRequestInput{
		Principal:           teacherPrincipalWithStudents("student_001"),
		QuizArchiveItemID:   " tarch_quiz ",
		SubmissionID:        " quiz_sub_week_3 ",
		GradingInstructions: " grade submitted answers ",
		RubricRef:           " local://rubrics/week-3.json ",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if got.ID != "grading_req_submission" {
		t.Fatalf("ID = %q", got.ID)
	}
	if got.SourceArchiveContentRef != "local://teaching/quizzes/week-3.pdf" {
		t.Fatalf("SourceArchiveContentRef = %q", got.SourceArchiveContentRef)
	}
	if got.SourceQuizSubmissionID != "quiz_sub_week_3" {
		t.Fatalf("SourceQuizSubmissionID = %q", got.SourceQuizSubmissionID)
	}
	if got.SourceAnswerRef != "local://answers/student_001/week-3.json" {
		t.Fatalf("SourceAnswerRef = %q", got.SourceAnswerRef)
	}
	if repo.gradingCreates != 1 {
		t.Fatalf("gradingCreates = %d", repo.gradingCreates)
	}
	if repo.createdGrading.SourceAnswerRef != "local://answers/student_001/week-3.json" {
		t.Fatalf("created SourceAnswerRef = %q", repo.createdGrading.SourceAnswerRef)
	}
}

func TestCreateQuizSubmissionAIGradingRequestRejectsMismatchedSubmission(t *testing.T) {
	repo := &fakeQuizSubmissionRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_quiz": teachingQuizItem("tarch_quiz", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		},
		submissions: []domain.QuizSubmission{
			quizSubmissionForAIGrading("quiz_sub_week_3", "tarch_other_quiz", "student_001"),
		},
	}
	uc := usecase.NewCreateQuizSubmissionAIGradingRequest(repo, fixedIDs{id: "grading_req_submission"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateQuizSubmissionAIGradingRequestInput{
		Principal:           teacherPrincipalWithStudents("student_001"),
		QuizArchiveItemID:   "tarch_quiz",
		SubmissionID:        "quiz_sub_week_3",
		GradingInstructions: "grade submitted answers",
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
	if repo.gradingCreates != 0 {
		t.Fatalf("gradingCreates = %d", repo.gradingCreates)
	}
}

func quizSubmissionForAIGrading(id string, quizArchiveItemID string, studentID string) domain.QuizSubmission {
	return domain.QuizSubmission{
		ID:                     id,
		QuizArchiveItemID:      quizArchiveItemID,
		StudentID:              studentID,
		SubmittedByPrincipalID: studentID,
		AnswerRef:              "local://answers/" + studentID + "/week-3.json",
		Status:                 domain.QuizSubmissionStatusSubmitted,
		SubmittedAt:            time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC),
	}
}
