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

func TestGetByIDReturnsDeepResearchStorageCommitPhysicalRow(t *testing.T) {
	db := &recordingDB{rows: &singleArchiveItemRow{}}
	repository := postgres.NewArchiveRepository(db)

	item, ok, err := repository.GetByID(context.Background(), "tarch_deep_research_001")
	if err != nil {
		t.Fatalf("GetByID returned error: %v", err)
	}
	if !ok {
		t.Fatalf("GetByID ok = false, want true")
	}
	for _, fragment := range []string{
		"FROM teaching_archive_items",
		"WHERE id = $1",
		"LIMIT 1",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 1 || db.args[0] != "tarch_deep_research_001" {
		t.Fatalf("args = %#v, want deep_research archive id", db.args)
	}
	if item.ID != "tarch_deep_research_001" ||
		item.OwnerType != domain.OwnerTypeStudent ||
		item.StudentID != "student_001" ||
		item.MaterialType != domain.MaterialTypeHandout ||
		item.Title != "Evidence grounded learning support draft" ||
		item.Source != domain.SourceSystemImport ||
		item.ContentRef != "research-deep-research-projection:deep_research_student_archive_projection_001:sha256_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ||
		item.OCRStatus != domain.OCRStatusNotRequired {
		t.Fatalf("item shape = %#v", item)
	}
	if strings.Join(item.Tags, ",") != "deep_research,student_archive,projection,math_unit" {
		t.Fatalf("tags = %#v", item.Tags)
	}
	if len(item.AnalysisIntents) != 2 ||
		item.AnalysisIntents[0] != domain.AnalysisIntentArchiveOnly ||
		item.AnalysisIntents[1] != domain.AnalysisIntentTutoring {
		t.Fatalf("analysis intents = %#v", item.AnalysisIntents)
	}
}

func TestGetByIDReturnsStudentAppAiTutorFeedbackArchiveStorageCommitPhysicalRow(t *testing.T) {
	db := &recordingDB{rows: &singleStudentAppFeedbackArchiveItemRow{}}
	repository := postgres.NewArchiveRepository(db)

	item, ok, err := repository.GetByID(context.Background(), "tarch_student_feedback_001")
	if err != nil {
		t.Fatalf("GetByID returned error: %v", err)
	}
	if !ok {
		t.Fatalf("GetByID ok = false, want true")
	}
	for _, fragment := range []string{"FROM teaching_archive_items", "WHERE id = $1", "LIMIT 1"} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 1 || db.args[0] != "tarch_student_feedback_001" {
		t.Fatalf("args = %#v, want Student App AI Tutor feedback archive id", db.args)
	}
	if item.ID != "tarch_student_feedback_001" ||
		item.OwnerType != domain.OwnerTypeStudent ||
		item.StudentID != "student_001" ||
		item.MaterialType != domain.MaterialTypeHomework ||
		item.Title != "Student AI Tutor feedback archive qbank_ans_sub_feedback_001" ||
		item.Source != domain.SourceSystemImport ||
		!strings.HasPrefix(item.ContentRef, "student-ai-tutor-feedback-archive:feedback_archive_cmd_qbank_001:sha256_") ||
		item.OCRStatus != domain.OCRStatusNotRequired {
		t.Fatalf("item shape = %#v", item)
	}
	if strings.Join(item.Tags, ",") != "student_app_ai_tutor,feedback,question_bank,archive_commit" {
		t.Fatalf("tags = %#v", item.Tags)
	}
	if len(item.AnalysisIntents) != 2 ||
		item.AnalysisIntents[0] != domain.AnalysisIntentArchiveOnly ||
		item.AnalysisIntents[1] != domain.AnalysisIntentTutoring {
		t.Fatalf("analysis intents = %#v", item.AnalysisIntents)
	}
}

func TestGetByIDReturnsStudentAppAiTutorFeedbackArchiveStorageCommitControlledDraftSourcePhysicalRow(t *testing.T) {
	db := &recordingDB{rows: &singleStudentAppFeedbackArchiveControlledSourceItemRow{}}
	repository := postgres.NewArchiveRepository(db)

	item, ok, err := repository.GetByID(context.Background(), "tarch_student_feedback_controlled_source_001")
	if err != nil {
		t.Fatalf("GetByID returned error: %v", err)
	}
	if !ok {
		t.Fatalf("GetByID ok = false, want true")
	}
	for _, fragment := range []string{"FROM teaching_archive_items", "WHERE id = $1", "LIMIT 1"} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 1 || db.args[0] != "tarch_student_feedback_controlled_source_001" {
		t.Fatalf("args = %#v, want controlled-source Student App AI Tutor feedback archive id", db.args)
	}
	if item.ID != "tarch_student_feedback_controlled_source_001" ||
		item.OwnerType != domain.OwnerTypeStudent ||
		item.StudentID != "student_001" ||
		item.MaterialType != domain.MaterialTypeHomework ||
		item.Title != "Student AI Tutor feedback archive controlled source qbank_ans_sub_audit_001" ||
		item.Source != domain.SourceSystemImport ||
		!strings.HasPrefix(item.ContentRef, "student-ai-tutor-feedback-archive-controlled-draft-source:feedback_archive_cmd_controlled_draft_qbank_001:sha256_") ||
		item.OCRStatus != domain.OCRStatusNotRequired {
		t.Fatalf("item shape = %#v", item)
	}
	if strings.Join(item.Tags, ",") != "student_app_ai_tutor,feedback,question_bank,archive_commit,controlled_draft_source" {
		t.Fatalf("tags = %#v", item.Tags)
	}
	if len(item.AnalysisIntents) != 2 ||
		item.AnalysisIntents[0] != domain.AnalysisIntentArchiveOnly ||
		item.AnalysisIntents[1] != domain.AnalysisIntentTutoring {
		t.Fatalf("analysis intents = %#v", item.AnalysisIntents)
	}
}

func TestGetByIDReturnsStudentAppAiTutorResultArchiveStorageCommitPhysicalRow(t *testing.T) {
	db := &recordingDB{rows: &singleStudentAppAiTutorResultArchiveItemRow{}}
	repository := postgres.NewArchiveRepository(db)

	item, ok, err := repository.GetByID(context.Background(), "tarch_student_ai_tutor_result_001")
	if err != nil {
		t.Fatalf("GetByID returned error: %v", err)
	}
	if !ok {
		t.Fatalf("GetByID ok = false, want true")
	}
	for _, fragment := range []string{"FROM teaching_archive_items", "WHERE id = $1", "LIMIT 1"} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 1 || db.args[0] != "tarch_student_ai_tutor_result_001" {
		t.Fatalf("args = %#v, want Student App AI Tutor result archive id", db.args)
	}
	if item.ID != "tarch_student_ai_tutor_result_001" ||
		item.OwnerType != domain.OwnerTypeStudent ||
		item.StudentID != "student_001" ||
		item.MaterialType != domain.MaterialTypeHomework ||
		item.Title != "Student AI Tutor result archive tutor_req_student_app_001" ||
		item.Source != domain.SourceSystemImport ||
		!strings.HasPrefix(item.ContentRef, "student-ai-tutor-result-archive:ai_tutor_result_archive_cmd_001:sha256_") ||
		item.OCRStatus != domain.OCRStatusNotRequired {
		t.Fatalf("item shape = %#v", item)
	}
	if strings.Join(item.Tags, ",") != "student_app_ai_tutor,result,safe_guidance,archive_commit" {
		t.Fatalf("tags = %#v", item.Tags)
	}
	if len(item.AnalysisIntents) != 2 ||
		item.AnalysisIntents[0] != domain.AnalysisIntentArchiveOnly ||
		item.AnalysisIntents[1] != domain.AnalysisIntentTutoring {
		t.Fatalf("analysis intents = %#v", item.AnalysisIntents)
	}
}

func TestGetByIDReturnsStudentAppAiTutorResultArchiveStorageCommitResultArchiveSourcePhysicalRow(t *testing.T) {
	db := &recordingDB{rows: &singleStudentAppAiTutorResultArchiveItemRow{
		title:      "Student AI Tutor result archive tutor_req_student_app_result_archive_001",
		contentRef: "student-ai-tutor-result-archive:ai_tutor_result_archive_cmd_result_archive_001:sha256_fca56f06fe276b7f151662647a31ff0dde640358f3fdad476a813738dbd569b5",
	}}
	repository := postgres.NewArchiveRepository(db)

	item, ok, err := repository.GetByID(context.Background(), "tarch_student_ai_tutor_result_001")
	if err != nil {
		t.Fatalf("GetByID returned error: %v", err)
	}
	if !ok {
		t.Fatalf("GetByID ok = false, want true")
	}
	if item.ID != "tarch_student_ai_tutor_result_001" ||
		item.Title != "Student AI Tutor result archive tutor_req_student_app_result_archive_001" ||
		item.Source != domain.SourceSystemImport ||
		!strings.HasPrefix(item.ContentRef, "student-ai-tutor-result-archive:ai_tutor_result_archive_cmd_result_archive_001:sha256_") {
		t.Fatalf("result-archive source item shape = %#v", item)
	}
	if strings.Join(item.Tags, ",") != "student_app_ai_tutor,result,safe_guidance,archive_commit" {
		t.Fatalf("tags = %#v", item.Tags)
	}
	if len(item.AnalysisIntents) != 2 ||
		item.AnalysisIntents[0] != domain.AnalysisIntentArchiveOnly ||
		item.AnalysisIntents[1] != domain.AnalysisIntentTutoring {
		t.Fatalf("analysis intents = %#v", item.AnalysisIntents)
	}
}

func TestGetByIDReturnsTeachingArchiveMaterialDraftStorageCommitPhysicalRow(t *testing.T) {
	db := &recordingDB{rows: &singleTeachingArchiveMaterialDraftItemRow{}}
	repository := postgres.NewArchiveRepository(db)

	item, ok, err := repository.GetByID(context.Background(), "tarch_archive_material_001")
	if err != nil {
		t.Fatalf("GetByID returned error: %v", err)
	}
	if !ok {
		t.Fatalf("GetByID ok = false, want true")
	}
	for _, fragment := range []string{"FROM teaching_archive_items", "WHERE id = $1", "LIMIT 1"} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 1 || db.args[0] != "tarch_archive_material_001" {
		t.Fatalf("args = %#v, want Teaching Archive material draft archive id", db.args)
	}
	if item.ID != "tarch_archive_material_001" ||
		item.OwnerType != domain.OwnerTypeStudent ||
		item.StudentID != "student_001" ||
		item.MaterialType != domain.MaterialTypeHandout ||
		item.Title != "Fractions practice packet" ||
		item.Source != domain.SourceSystemImport ||
		item.ContentRef != "precommit://archive-material/student_001/fractions-packet" ||
		item.OCRStatus != domain.OCRStatusNotRequired {
		t.Fatalf("item shape = %#v", item)
	}
	if strings.Join(item.Tags, ",") != "fractions,draft-approved" {
		t.Fatalf("tags = %#v", item.Tags)
	}
	if len(item.AnalysisIntents) != 1 ||
		item.AnalysisIntents[0] != domain.AnalysisIntentArchiveOnly {
		t.Fatalf("analysis intents = %#v", item.AnalysisIntents)
	}
}

type singleArchiveItemRow struct {
	advanced bool
}

func (r *singleArchiveItemRow) Close() {}

func (r *singleArchiveItemRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleArchiveItemRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = "tarch_deep_research_001"
	*(dest[1].(*string)) = string(domain.OwnerTypeStudent)
	*(dest[2].(*sql.NullString)) = sql.NullString{String: "student_001", Valid: true}
	*(dest[3].(*string)) = string(domain.MaterialTypeHandout)
	*(dest[4].(*string)) = "Evidence grounded learning support draft"
	*(dest[5].(*string)) = string(domain.SourceSystemImport)
	*(dest[6].(*string)) = "research-deep-research-projection:deep_research_student_archive_projection_001:sha256_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	*(dest[7].(*[]byte)) = []byte(`["deep_research","student_archive","projection","math_unit"]`)
	*(dest[8].(*[]byte)) = []byte(`["ARCHIVE_ONLY","TUTORING"]`)
	*(dest[9].(*string)) = string(domain.OCRStatusNotRequired)
	*(dest[10].(*time.Time)) = time.Date(2026, 6, 5, 0, 0, 0, 0, time.UTC)
	return nil
}

func (r *singleArchiveItemRow) Err() error {
	return nil
}

type singleStudentAppFeedbackArchiveItemRow struct {
	advanced bool
}

func (r *singleStudentAppFeedbackArchiveItemRow) Close() {}

func (r *singleStudentAppFeedbackArchiveItemRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleStudentAppFeedbackArchiveItemRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = "tarch_student_feedback_001"
	*(dest[1].(*string)) = string(domain.OwnerTypeStudent)
	*(dest[2].(*sql.NullString)) = sql.NullString{String: "student_001", Valid: true}
	*(dest[3].(*string)) = string(domain.MaterialTypeHomework)
	*(dest[4].(*string)) = "Student AI Tutor feedback archive qbank_ans_sub_feedback_001"
	*(dest[5].(*string)) = string(domain.SourceSystemImport)
	*(dest[6].(*string)) = "student-ai-tutor-feedback-archive:feedback_archive_cmd_qbank_001:sha256_4249595968f7ea8d603e6620d8f4abb688e52629b10fe0d9244627287fe18463"
	*(dest[7].(*[]byte)) = []byte(`["student_app_ai_tutor","feedback","question_bank","archive_commit"]`)
	*(dest[8].(*[]byte)) = []byte(`["ARCHIVE_ONLY","TUTORING"]`)
	*(dest[9].(*string)) = string(domain.OCRStatusNotRequired)
	*(dest[10].(*time.Time)) = time.Date(2026, 6, 6, 14, 0, 0, 0, time.UTC)
	return nil
}

func (r *singleStudentAppFeedbackArchiveItemRow) Err() error {
	return nil
}

type singleStudentAppFeedbackArchiveControlledSourceItemRow struct {
	advanced bool
}

func (r *singleStudentAppFeedbackArchiveControlledSourceItemRow) Close() {}

func (r *singleStudentAppFeedbackArchiveControlledSourceItemRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleStudentAppFeedbackArchiveControlledSourceItemRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = "tarch_student_feedback_controlled_source_001"
	*(dest[1].(*string)) = string(domain.OwnerTypeStudent)
	*(dest[2].(*sql.NullString)) = sql.NullString{String: "student_001", Valid: true}
	*(dest[3].(*string)) = string(domain.MaterialTypeHomework)
	*(dest[4].(*string)) = "Student AI Tutor feedback archive controlled source qbank_ans_sub_audit_001"
	*(dest[5].(*string)) = string(domain.SourceSystemImport)
	*(dest[6].(*string)) = "student-ai-tutor-feedback-archive-controlled-draft-source:feedback_archive_cmd_controlled_draft_qbank_001:sha256_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	*(dest[7].(*[]byte)) = []byte(`["student_app_ai_tutor","feedback","question_bank","archive_commit","controlled_draft_source"]`)
	*(dest[8].(*[]byte)) = []byte(`["ARCHIVE_ONLY","TUTORING"]`)
	*(dest[9].(*string)) = string(domain.OCRStatusNotRequired)
	*(dest[10].(*time.Time)) = time.Date(2026, 6, 7, 5, 50, 0, 0, time.UTC)
	return nil
}

func (r *singleStudentAppFeedbackArchiveControlledSourceItemRow) Err() error {
	return nil
}

type singleStudentAppAiTutorResultArchiveItemRow struct {
	advanced   bool
	title      string
	contentRef string
}

func (r *singleStudentAppAiTutorResultArchiveItemRow) Close() {}

func (r *singleStudentAppAiTutorResultArchiveItemRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleStudentAppAiTutorResultArchiveItemRow) Scan(dest ...any) error {
	title := r.title
	if title == "" {
		title = "Student AI Tutor result archive tutor_req_student_app_001"
	}
	contentRef := r.contentRef
	if contentRef == "" {
		contentRef = "student-ai-tutor-result-archive:ai_tutor_result_archive_cmd_001:sha256_271312a59510bdc5c453848296b910c16791663bc96b6243963830676ca083a0"
	}
	*(dest[0].(*string)) = "tarch_student_ai_tutor_result_001"
	*(dest[1].(*string)) = string(domain.OwnerTypeStudent)
	*(dest[2].(*sql.NullString)) = sql.NullString{String: "student_001", Valid: true}
	*(dest[3].(*string)) = string(domain.MaterialTypeHomework)
	*(dest[4].(*string)) = title
	*(dest[5].(*string)) = string(domain.SourceSystemImport)
	*(dest[6].(*string)) = contentRef
	*(dest[7].(*[]byte)) = []byte(`["student_app_ai_tutor","result","safe_guidance","archive_commit"]`)
	*(dest[8].(*[]byte)) = []byte(`["ARCHIVE_ONLY","TUTORING"]`)
	*(dest[9].(*string)) = string(domain.OCRStatusNotRequired)
	*(dest[10].(*time.Time)) = time.Date(2026, 6, 8, 12, 20, 0, 0, time.UTC)
	return nil
}

func (r *singleStudentAppAiTutorResultArchiveItemRow) Err() error {
	return nil
}

type singleTeachingArchiveMaterialDraftItemRow struct {
	advanced bool
}

func (r *singleTeachingArchiveMaterialDraftItemRow) Close() {}

func (r *singleTeachingArchiveMaterialDraftItemRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleTeachingArchiveMaterialDraftItemRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = "tarch_archive_material_001"
	*(dest[1].(*string)) = string(domain.OwnerTypeStudent)
	*(dest[2].(*sql.NullString)) = sql.NullString{String: "student_001", Valid: true}
	*(dest[3].(*string)) = string(domain.MaterialTypeHandout)
	*(dest[4].(*string)) = "Fractions practice packet"
	*(dest[5].(*string)) = string(domain.SourceSystemImport)
	*(dest[6].(*string)) = "precommit://archive-material/student_001/fractions-packet"
	*(dest[7].(*[]byte)) = []byte(`["fractions","draft-approved"]`)
	*(dest[8].(*[]byte)) = []byte(`["ARCHIVE_ONLY"]`)
	*(dest[9].(*string)) = string(domain.OCRStatusNotRequired)
	*(dest[10].(*time.Time)) = time.Date(2026, 6, 7, 8, 0, 0, 0, time.UTC)
	return nil
}

func (r *singleTeachingArchiveMaterialDraftItemRow) Err() error {
	return nil
}
