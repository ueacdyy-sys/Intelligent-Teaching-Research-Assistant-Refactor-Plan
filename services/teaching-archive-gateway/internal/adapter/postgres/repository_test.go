package postgres_test

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestListTutoringAnalysisRequestsBuildsScopedIndexedQuery(t *testing.T) {
	db := &recordingDB{rows: &singleTutoringAnalysisRequestRow{}}
	repository := postgres.NewArchiveRepository(db)

	requests, err := repository.ListTutoringAnalysisRequests(context.Background(), domain.TutoringAnalysisRequestQuery{
		Status:                 domain.TutoringAnalysisStatusQueued,
		ArchiveItemID:          "tarch_001",
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		StudentID:              "student_001",
		RequestedByPrincipalID: "teacher_001",
		FetchLimit:             3,
		Cursor: &domain.TutoringAnalysisRequestCursor{
			CreatedAt: time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC),
			ID:        "tutor_req_cursor",
		},
	})
	if err != nil {
		t.Fatalf("ListTutoringAnalysisRequests returned error: %v", err)
	}

	for _, fragment := range []string{
		"status = $1",
		"archive_item_id = $2",
		"requested_by_principal_id = $3",
		"source_archive_owner_type = $4",
		"source_archive_student_id = $5",
		"(created_at, id) < ($6, $7)",
		"ORDER BY created_at DESC, id DESC",
		"LIMIT $8",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 8 {
		t.Fatalf("args = %d, want 8", len(db.args))
	}
	if len(requests) != 1 || requests[0].ID != "tutor_req_row" {
		t.Fatalf("requests = %#v", requests)
	}
}

type recordingDB struct {
	lastSQL string
	args    []any
	rows    postgres.Rows
}

func (db *recordingDB) Exec(context.Context, string, ...any) (postgres.CommandTag, error) {
	return nil, nil
}

func (db *recordingDB) Query(_ context.Context, query string, args ...any) (postgres.Rows, error) {
	db.lastSQL = query
	db.args = append([]any(nil), args...)
	return db.rows, nil
}

type singleTutoringAnalysisRequestRow struct {
	advanced bool
}

func (r *singleTutoringAnalysisRequestRow) Close() {}

func (r *singleTutoringAnalysisRequestRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleTutoringAnalysisRequestRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = "tutor_req_row"
	*(dest[1].(*string)) = "tarch_001"
	*(dest[2].(*string)) = "teacher_001"
	*(dest[3].(*string)) = "find weak skills"
	*(dest[4].(*string)) = string(domain.QuestionBankIntentGeneratePersonalizedCheck)
	*(dest[5].(*string)) = string(domain.TutoringAnalysisStatusQueued)
	*(dest[6].(*string)) = string(domain.OwnerTypeStudent)
	*(dest[7].(*sql.NullString)) = sql.NullString{String: "student_001", Valid: true}
	*(dest[8].(*string)) = string(domain.MaterialTypeQuiz)
	*(dest[9].(*time.Time)) = time.Date(2026, 5, 29, 10, 1, 0, 0, time.UTC)
	return nil
}

func (r *singleTutoringAnalysisRequestRow) Err() error {
	return nil
}
