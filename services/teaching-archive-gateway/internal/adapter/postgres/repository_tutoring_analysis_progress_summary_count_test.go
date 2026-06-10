package postgres_test

import (
	"context"
	"strings"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestCountTutoringAnalysisRequestsByStatusBuildsCountOnlyGroupedQuery(t *testing.T) {
	db := &recordingDB{
		rows: &statusCountRows{
			rows: []statusCountRow{
				{status: string(domain.TutoringAnalysisStatusQueued), count: 1},
				{status: string(domain.TutoringAnalysisStatusInProgress), count: 1},
				{status: string(domain.TutoringAnalysisStatusSucceeded), count: 2},
				{status: string(domain.TutoringAnalysisStatusFailed), count: 1},
			},
		},
	}
	repository := postgres.NewArchiveRepository(db)

	counts, err := repository.CountTutoringAnalysisRequestsByStatus(
		context.Background(),
		domain.TutoringAnalysisRequestQuery{
			SourceArchiveOwnerType: domain.OwnerTypeStudent,
			StudentID:              "student_001",
			RequestedByPrincipalID: "student_001",
		},
	)
	if err != nil {
		t.Fatalf("CountTutoringAnalysisRequestsByStatus returned error: %v", err)
	}

	for _, fragment := range []string{
		"SELECT",
		"status",
		"COUNT(*)",
		"FROM teaching_tutoring_analysis_requests",
		"requested_by_principal_id = $1",
		"source_archive_owner_type = $2",
		"source_archive_student_id = $3",
		"GROUP BY status",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	for _, forbidden := range []string{
		"ORDER BY",
		"LIMIT",
		"archive_item_id,",
		"analysis_goal",
		"result_ref",
		"claimed_by_worker_id",
	} {
		if strings.Contains(db.lastSQL, forbidden) {
			t.Fatalf("SQL includes forbidden %q in: %s", forbidden, db.lastSQL)
		}
	}
	if len(db.args) != 3 {
		t.Fatalf("args = %d, want 3", len(db.args))
	}
	if counts[domain.TutoringAnalysisStatusQueued] != 1 ||
		counts[domain.TutoringAnalysisStatusInProgress] != 1 ||
		counts[domain.TutoringAnalysisStatusSucceeded] != 2 ||
		counts[domain.TutoringAnalysisStatusFailed] != 1 {
		t.Fatalf("counts = %#v", counts)
	}
}

type statusCountRow struct {
	status string
	count  int64
}

type statusCountRows struct {
	rows  []statusCountRow
	index int
}

func (r *statusCountRows) Close() {}

func (r *statusCountRows) Next() bool {
	if r.index >= len(r.rows) {
		return false
	}
	r.index++
	return true
}

func (r *statusCountRows) Scan(dest ...any) error {
	row := r.rows[r.index-1]
	*(dest[0].(*string)) = row.status
	*(dest[1].(*int64)) = row.count
	return nil
}

func (r *statusCountRows) Err() error {
	return nil
}
