package postgres_test

import (
	"context"
	"strings"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestListTutoringAnalysisRequestsBuildsMultiStatusPredicate(t *testing.T) {
	db := &recordingDB{rows: &singleTutoringAnalysisRequestRow{}}
	repository := postgres.NewArchiveRepository(db)

	_, err := repository.ListTutoringAnalysisRequests(context.Background(), domain.TutoringAnalysisRequestQuery{
		Statuses: []domain.TutoringAnalysisStatus{
			domain.TutoringAnalysisStatusQueued,
			domain.TutoringAnalysisStatusInProgress,
		},
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		StudentID:              "student_001",
		FetchLimit:             3,
	})
	if err != nil {
		t.Fatalf("ListTutoringAnalysisRequests returned error: %v", err)
	}

	for _, fragment := range []string{
		"status = ANY($1)",
		"source_archive_owner_type = $2",
		"source_archive_student_id = $3",
		"ORDER BY created_at DESC, id DESC",
		"LIMIT $4",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 4 {
		t.Fatalf("args = %d, want 4", len(db.args))
	}
}
