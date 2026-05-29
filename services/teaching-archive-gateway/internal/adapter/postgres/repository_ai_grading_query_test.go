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

func TestListAIGradingRequestsBuildsScopedIndexedQuery(t *testing.T) {
	db := &recordingDB{rows: &singleAIGradingRequestRow{}}
	repository := postgres.NewArchiveRepository(db)

	requests, err := repository.ListAIGradingRequests(context.Background(), domain.AIGradingRequestQuery{
		Status:                 domain.AIGradingStatusQueued,
		ArchiveItemID:          "tarch_001",
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		StudentID:              "student_001",
		FetchLimit:             3,
		Cursor: &domain.AIGradingRequestCursor{
			CreatedAt: time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC),
			ID:        "grading_req_cursor",
		},
	})
	if err != nil {
		t.Fatalf("ListAIGradingRequests returned error: %v", err)
	}

	for _, fragment := range []string{
		"FROM teaching_ai_grading_requests",
		"status = $1",
		"archive_item_id = $2",
		"source_archive_owner_type = $3",
		"source_archive_student_id = $4",
		"(created_at, id) < ($5, $6)",
		"ORDER BY created_at DESC, id DESC",
		"LIMIT $7",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 7 {
		t.Fatalf("args = %d, want 7", len(db.args))
	}
	if len(requests) != 1 || requests[0].ID != "grading_req_row" {
		t.Fatalf("requests = %#v", requests)
	}
}

type singleAIGradingRequestRow struct {
	advanced            bool
	status              domain.AIGradingStatus
	claimedByWorkerID   string
	claimExpiresAt      time.Time
	claimExpiresAtValid bool
}

func (r *singleAIGradingRequestRow) Close() {}

func (r *singleAIGradingRequestRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleAIGradingRequestRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = "grading_req_row"
	*(dest[1].(*string)) = "tarch_001"
	*(dest[2].(*string)) = "teacher_001"
	*(dest[3].(*string)) = "grade short answers"
	*(dest[4].(*sql.NullString)) = sql.NullString{String: "local://rubrics/week-3.json", Valid: true}
	status := r.status
	if status == "" {
		status = domain.AIGradingStatusQueued
	}
	*(dest[5].(*string)) = string(status)
	*(dest[6].(*string)) = string(domain.OwnerTypeStudent)
	*(dest[7].(*sql.NullString)) = sql.NullString{String: "student_001", Valid: true}
	*(dest[8].(*string)) = string(domain.MaterialTypeQuiz)
	*(dest[9].(*string)) = string(domain.OCRStatusReserved)
	*(dest[10].(*sql.NullString)) = sql.NullString{String: r.claimedByWorkerID, Valid: r.claimedByWorkerID != ""}
	*(dest[11].(*sql.NullTime)) = sql.NullTime{Time: r.claimExpiresAt, Valid: r.claimExpiresAtValid}
	*(dest[12].(*time.Time)) = time.Date(2026, 5, 29, 10, 1, 0, 0, time.UTC)
	*(dest[13].(*time.Time)) = time.Date(2026, 5, 29, 10, 1, 0, 0, time.UTC)
	return nil
}

func (r *singleAIGradingRequestRow) Err() error {
	return nil
}
