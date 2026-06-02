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

func TestCreateQuizSubmissionForExistingTeachingQuizConditionallyInsertsMetadata(t *testing.T) {
	db := &recordingDB{tag: commandTag{rowsAffected: 1}}
	repository := postgres.NewArchiveRepository(db)

	created, err := repository.CreateQuizSubmissionForExistingTeachingQuiz(
		context.Background(),
		domain.QuizSubmission{
			ID:                     "quiz_sub_row",
			QuizArchiveItemID:      "tarch_quiz",
			StudentID:              "student_001",
			SubmittedByPrincipalID: "student_001",
			AnswerRef:              "local://answers/student_001/week-3.json",
			Status:                 domain.QuizSubmissionStatusSubmitted,
			SubmittedAt:            time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC),
		},
	)
	if err != nil {
		t.Fatalf("CreateQuizSubmissionForExistingTeachingQuiz returned error: %v", err)
	}
	if !created {
		t.Fatalf("created = false, want true")
	}

	for _, fragment := range []string{
		"INSERT INTO teaching_quiz_submissions",
		"SELECT",
		"$1",
		"item.id",
		"FROM teaching_archive_items AS item",
		"WHERE item.id = $2",
		"item.owner_type = $8",
		"item.material_type = $9",
	} {
		if !strings.Contains(db.lastExecSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastExecSQL)
		}
	}
	if len(db.execArgs) != 9 {
		t.Fatalf("args = %d, want 9", len(db.execArgs))
	}
	if db.execArgs[7] != domain.OwnerTypeTeaching {
		t.Fatalf("owner type arg = %#v", db.execArgs[7])
	}
	if db.execArgs[8] != domain.MaterialTypeQuiz {
		t.Fatalf("material type arg = %#v", db.execArgs[8])
	}
}

func TestCreateQuizSubmissionForExistingTeachingQuizReturnsFalseWhenNoTeachingQuizMatches(t *testing.T) {
	db := &recordingDB{tag: commandTag{rowsAffected: 0}}
	repository := postgres.NewArchiveRepository(db)

	created, err := repository.CreateQuizSubmissionForExistingTeachingQuiz(
		context.Background(),
		domain.QuizSubmission{
			ID:                     "quiz_sub_row",
			QuizArchiveItemID:      "tarch_missing",
			StudentID:              "student_001",
			SubmittedByPrincipalID: "student_001",
			AnswerRef:              "local://answers/student_001/week-3.json",
			Status:                 domain.QuizSubmissionStatusSubmitted,
			SubmittedAt:            time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC),
		},
	)
	if err != nil {
		t.Fatalf("CreateQuizSubmissionForExistingTeachingQuiz returned error: %v", err)
	}
	if created {
		t.Fatalf("created = true, want false")
	}
}
