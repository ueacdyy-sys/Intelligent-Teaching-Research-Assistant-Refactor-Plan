package postgres_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestListQuizSubmissionsBuildsScopedIndexedQuery(t *testing.T) {
	db := &recordingDB{rows: &singleQuizSubmissionRow{}}
	repository := postgres.NewArchiveRepository(db)

	submissions, err := repository.ListQuizSubmissions(context.Background(), domain.QuizSubmissionQuery{
		QuizArchiveItemID: "tarch_quiz",
		StudentID:         "student_001",
		FetchLimit:        3,
		Cursor: &domain.QuizSubmissionCursor{
			SubmittedAt: time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC),
			ID:          "quiz_sub_cursor",
		},
	})
	if err != nil {
		t.Fatalf("ListQuizSubmissions returned error: %v", err)
	}

	for _, fragment := range []string{
		"FROM teaching_quiz_submissions",
		"quiz_archive_item_id = $1",
		"student_id = $2",
		"(submitted_at, id) < ($3, $4)",
		"ORDER BY submitted_at DESC, id DESC",
		"LIMIT $5",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 5 {
		t.Fatalf("args = %d, want 5", len(db.args))
	}
	if len(submissions) != 1 || submissions[0].ID != "quiz_sub_row" {
		t.Fatalf("submissions = %#v", submissions)
	}
}

type singleQuizSubmissionRow struct {
	advanced bool
}

func (r *singleQuizSubmissionRow) Close() {}

func (r *singleQuizSubmissionRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleQuizSubmissionRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = "quiz_sub_row"
	*(dest[1].(*string)) = "tarch_quiz"
	*(dest[2].(*string)) = "student_001"
	*(dest[3].(*string)) = "student_001"
	*(dest[4].(*string)) = "local://answers/student_001/week-3.json"
	*(dest[5].(*string)) = string(domain.QuizSubmissionStatusSubmitted)
	*(dest[6].(*time.Time)) = time.Date(2026, 5, 30, 10, 1, 0, 0, time.UTC)
	return nil
}

func (r *singleQuizSubmissionRow) Err() error {
	return nil
}
