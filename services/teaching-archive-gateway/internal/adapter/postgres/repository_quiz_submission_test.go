package postgres_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestCreateQuizSubmissionInsertsMetadataOnly(t *testing.T) {
	db := &recordingDB{tag: commandTag{rowsAffected: 1}}
	repository := postgres.NewArchiveRepository(db)

	err := repository.CreateQuizSubmission(context.Background(), domain.QuizSubmission{
		ID:                     "quiz_sub_row",
		QuizArchiveItemID:      "tarch_quiz",
		StudentID:              "student_001",
		SubmittedByPrincipalID: "student_001",
		AnswerRef:              "local://answers/student_001/week-3.json",
		Status:                 domain.QuizSubmissionStatusSubmitted,
		SubmittedAt:            time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("CreateQuizSubmission returned error: %v", err)
	}

	for _, fragment := range []string{
		"INSERT INTO teaching_quiz_submissions",
		"quiz_archive_item_id",
		"submitted_by_principal_id",
		"answer_ref",
		"VALUES ($1, $2, $3, $4, $5, $6, $7)",
	} {
		if !strings.Contains(db.lastExecSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastExecSQL)
		}
	}
	if len(db.execArgs) != 7 {
		t.Fatalf("args = %d, want 7", len(db.execArgs))
	}
}
