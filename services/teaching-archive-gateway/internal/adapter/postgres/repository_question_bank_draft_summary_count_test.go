package postgres_test

import (
	"context"
	"strings"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestCountQuestionBankDraftsBySourceMaterialBuildsCountOnlyGroupedQuery(t *testing.T) {
	db := &recordingDB{
		rows: &materialTypeCountRows{
			rows: []materialTypeCountRow{
				{materialType: string(domain.MaterialTypeQuiz), count: 2},
				{materialType: string(domain.MaterialTypeHandout), count: 1},
			},
		},
	}
	repository := postgres.NewArchiveRepository(db)

	counts, err := repository.CountQuestionBankDraftsBySourceMaterial(
		context.Background(),
		domain.TutoringAnalysisRequestQuery{
			Status:                      domain.TutoringAnalysisStatusSucceeded,
			SourceArchiveOwnerType:      domain.OwnerTypeStudent,
			StudentID:                   "student_001",
			RequireQuestionBankDraftRef: true,
		},
	)
	if err != nil {
		t.Fatalf("CountQuestionBankDraftsBySourceMaterial returned error: %v", err)
	}
	for _, fragment := range []string{
		"SELECT",
		"source_archive_material",
		"COUNT(*)",
		"FROM teaching_tutoring_analysis_requests",
		"status = $1",
		"source_archive_owner_type = $2",
		"source_archive_student_id = $3",
		"question_bank_draft_ref IS NOT NULL",
		"GROUP BY source_archive_material",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	for _, forbidden := range []string{
		"ORDER BY",
		"LIMIT",
		"archive_item_id,",
		"result_ref",
		"question_bank_draft_ref,",
		"claimed_by_worker_id",
	} {
		if strings.Contains(db.lastSQL, forbidden) {
			t.Fatalf("SQL includes forbidden %q in: %s", forbidden, db.lastSQL)
		}
	}
	if len(db.args) != 3 ||
		db.args[0] != string(domain.TutoringAnalysisStatusSucceeded) ||
		db.args[1] != string(domain.OwnerTypeStudent) ||
		db.args[2] != "student_001" {
		t.Fatalf("args = %#v", db.args)
	}
	if counts[domain.MaterialTypeQuiz] != 2 || counts[domain.MaterialTypeHandout] != 1 {
		t.Fatalf("counts = %#v", counts)
	}
}
