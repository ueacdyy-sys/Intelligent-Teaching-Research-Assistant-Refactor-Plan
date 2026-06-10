package postgres_test

import (
	"context"
	"strings"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
)

func TestEnsureSchemaCreatesStudentAppAITutorResultArchiveSnapshotTable(t *testing.T) {
	db := &recordingDB{}

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema returned error: %v", err)
	}

	statements := strings.Join(db.execStatements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS teaching_ai_tutor_result_archive_snapshots",
		"archive_item_id TEXT PRIMARY KEY REFERENCES teaching_archive_items(id)",
		"source_archive_item_id TEXT NOT NULL",
		"source_tutoring_analysis_request_id TEXT NOT NULL",
		"guidance_sections JSONB NOT NULL",
		"safe_guidance_only BOOLEAN NOT NULL",
		"follow_up_depth INTEGER NOT NULL DEFAULT 0",
		"idx_teaching_ai_tutor_result_archive_snapshots_student_ready",
		"idx_teaching_ai_tutor_result_archive_snapshots_source_lineage",
		"WHERE safe_guidance_only = TRUE",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("schema missing %q in: %s", fragment, statements)
		}
	}
}

func TestGetStudentAppAITutorResultArchiveSnapshotReadsSafeProjectionOnly(t *testing.T) {
	db := &recordingDB{rows: &singleAITutorResultArchiveSnapshotRow{}}
	repository := postgres.NewArchiveRepository(db)

	snapshot, ok, err := repository.GetStudentAppAITutorResultArchiveSnapshot(
		context.Background(),
		"tarch_student_ai_tutor_result_001",
		"student_001",
	)
	if err != nil {
		t.Fatalf("GetStudentAppAITutorResultArchiveSnapshot returned error: %v", err)
	}
	if !ok || snapshot.ArchiveItemID != "tarch_student_ai_tutor_result_001" ||
		snapshot.SourceArchiveItemID != "tarch_source_student_homework_001" ||
		snapshot.SourceTutoringRequestID != "tutor_req_student_app_001" ||
		len(snapshot.GuidanceSections) != 2 || !snapshot.SafeGuidanceOnly ||
		snapshot.FollowUpDepth != 1 {
		t.Fatalf("snapshot = %#v, ok=%v", snapshot, ok)
	}
	for _, fragment := range []string{
		"FROM teaching_ai_tutor_result_archive_snapshots AS snapshot",
		"snapshot.archive_item_id = $1",
		"snapshot.student_id = $2",
		"snapshot.source_archive_item_id",
		"snapshot.source_tutoring_analysis_request_id",
		"snapshot.safe_guidance_only = TRUE",
		"snapshot.follow_up_depth",
		"LIMIT 1",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	for _, forbidden := range []string{"SELECT *", "content_ref", "contentRef", "raw_model_output", "result_ref"} {
		if strings.Contains(db.lastSQL, forbidden) {
			t.Fatalf("snapshot SQL leaked forbidden fragment %q in: %s", forbidden, db.lastSQL)
		}
	}
	if len(db.args) != 2 || db.args[0] != "tarch_student_ai_tutor_result_001" ||
		db.args[1] != "student_001" {
		t.Fatalf("args = %#v", db.args)
	}
}

type singleAITutorResultArchiveSnapshotRow struct {
	advanced bool
}

func (r *singleAITutorResultArchiveSnapshotRow) Close() {}

func (r *singleAITutorResultArchiveSnapshotRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleAITutorResultArchiveSnapshotRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = "tarch_student_ai_tutor_result_001"
	*(dest[1].(*string)) = "student_001"
	*(dest[2].(*string)) = "tarch_source_student_homework_001"
	*(dest[3].(*string)) = "tutor_req_student_app_001"
	*(dest[4].(*string)) = "Guided help for comparing fractions."
	*(dest[5].(*[]byte)) = []byte(`[{"sectionID":"ai_tutor_answer_section_001","title":"Start with a common denominator","text":"Convert both fractions to the same denominator, then compare the numerators.","sourceBlockRefs":["block_section_001"]},{"sectionID":"ai_tutor_answer_section_002","title":"Check your reasoning","text":"Explain why the larger numerator is larger only after the denominators match.","sourceBlockRefs":["block_section_002"]}]`)
	*(dest[6].(*string)) = "05a82687de1587bfc882ecf8ec4f54421da7ff0ab4e911cd0af88d4ffbecec4b"
	*(dest[7].(*[]byte)) = []byte(`["NO_DIAGNOSIS","STUDY_GUIDANCE_ONLY"]`)
	*(dest[8].(*bool)) = true
	*(dest[9].(*int)) = 1
	return nil
}

func (r *singleAITutorResultArchiveSnapshotRow) Err() error {
	return nil
}
