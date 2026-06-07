package postgres_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestEnsureSchemaCreatesArchiveMaterialContentPreviewTable(t *testing.T) {
	db := &recordingDB{}

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema returned error: %v", err)
	}

	statements := strings.Join(db.execStatements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS teaching_archive_material_content_previews",
		"archive_item_id TEXT PRIMARY KEY REFERENCES teaching_archive_items(id)",
		"preview_sections JSONB NOT NULL",
		"idx_teaching_archive_material_content_previews_student_updated",
		"WHERE preview_status = 'READY'",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("schema missing %q in: %s", fragment, statements)
		}
	}
}

func TestSavePublishedArchiveMaterialContentPreviewUpsertsSafeSections(t *testing.T) {
	db := &recordingDB{}
	repository := postgres.NewArchiveRepository(db)

	err := repository.SavePublishedArchiveMaterialContentPreview(
		context.Background(),
		publishedArchiveMaterialContentPreviewFixture(),
	)
	if err != nil {
		t.Fatalf("SavePublishedArchiveMaterialContentPreview returned error: %v", err)
	}

	for _, fragment := range []string{
		"INSERT INTO teaching_archive_material_content_previews",
		"preview_sections",
		"$7::jsonb",
		"ON CONFLICT (archive_item_id) DO UPDATE",
		"updated_at = EXCLUDED.updated_at",
	} {
		if !strings.Contains(db.lastExecSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastExecSQL)
		}
	}
	if len(db.execArgs) != 9 {
		t.Fatalf("args = %d, want 9", len(db.execArgs))
	}
	if db.execArgs[0] != "tarch_archive_material_001" ||
		db.execArgs[1] != "student_001" ||
		db.execArgs[4] != domain.PublishedArchiveMaterialContentPreviewStatusReady {
		t.Fatalf("unexpected args: %#v", db.execArgs)
	}
	if !strings.Contains(string(db.execArgs[6].([]byte)), `"title":"Learning goals"`) {
		t.Fatalf("sections JSON = %s", db.execArgs[6])
	}
}

func TestGetPublishedContentPreviewForStudentAppUsesScopedVisibleProjection(t *testing.T) {
	db := &recordingDB{rows: &singlePublishedArchiveMaterialContentPreviewRow{}}
	repository := postgres.NewArchiveRepository(db)

	preview, ok, err := repository.GetPublishedContentPreviewForStudentApp(
		context.Background(),
		"tarch_archive_material_001",
		"student_001",
	)
	if err != nil {
		t.Fatalf("GetPublishedContentPreviewForStudentApp returned error: %v", err)
	}
	if !ok {
		t.Fatalf("expected preview")
	}
	if preview.ArchiveItemID != "tarch_archive_material_001" || len(preview.Sections) != 1 {
		t.Fatalf("preview = %#v", preview)
	}
	for _, fragment := range []string{
		"FROM teaching_archive_material_content_previews AS preview",
		"preview.archive_item_id = $1",
		"preview.student_id = $2",
		"preview.preview_status = 'READY'",
		"EXISTS",
		"FROM teaching_archive_publications AS publication",
		"publication.archive_item_id = preview.archive_item_id",
		"publication.student_id = preview.student_id",
		"publication.material_type = preview.material_type",
		"publication.scope_type = 'STUDENT_OWN_ARCHIVE'",
		"publication.publication_state = 'COMMITTED_TO_PUBLICATION_STORE'",
		"publication.visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED'",
		"publication.channel = 'STUDENT_APP'",
		"LIMIT 1",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	for _, forbidden := range []string{"SELECT *", "content_ref", "contentRef"} {
		if strings.Contains(db.lastSQL, forbidden) {
			t.Fatalf("preview SQL leaked forbidden fragment %q in: %s", forbidden, db.lastSQL)
		}
	}
	if len(db.args) != 2 ||
		db.args[0] != "tarch_archive_material_001" ||
		db.args[1] != "student_001" {
		t.Fatalf("args = %#v", db.args)
	}
}

type singlePublishedArchiveMaterialContentPreviewRow struct {
	advanced bool
}

func (r *singlePublishedArchiveMaterialContentPreviewRow) Close() {}

func (r *singlePublishedArchiveMaterialContentPreviewRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singlePublishedArchiveMaterialContentPreviewRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = "tarch_archive_material_001"
	*(dest[1].(*string)) = "student_001"
	*(dest[2].(*string)) = string(domain.MaterialTypeHandout)
	*(dest[3].(*string)) = "Fractions practice packet"
	*(dest[4].(*string)) = string(domain.PublishedArchiveMaterialContentPreviewStatusReady)
	*(dest[5].(*string)) = string(domain.PublishedArchiveMaterialContentPreviewSourceSafeReviewed)
	*(dest[6].(*[]byte)) = []byte(`[{"id":"section_001","title":"Learning goals","text":"Practice equivalent fractions.","pageHint":"p.1"}]`)
	*(dest[7].(*time.Time)) = time.Date(2026, 6, 7, 9, 0, 0, 0, time.UTC)
	*(dest[8].(*time.Time)) = time.Date(2026, 6, 7, 9, 5, 0, 0, time.UTC)
	return nil
}

func (r *singlePublishedArchiveMaterialContentPreviewRow) Err() error {
	return nil
}

func publishedArchiveMaterialContentPreviewFixture() domain.PublishedArchiveMaterialContentPreview {
	createdAt := time.Date(2026, 6, 7, 9, 0, 0, 0, time.UTC)
	return domain.PublishedArchiveMaterialContentPreview{
		ArchiveItemID: "tarch_archive_material_001",
		StudentID:     "student_001",
		MaterialType:  domain.MaterialTypeHandout,
		Title:         "Fractions practice packet",
		Status:        domain.PublishedArchiveMaterialContentPreviewStatusReady,
		PreviewSource: domain.PublishedArchiveMaterialContentPreviewSourceSafeReviewed,
		Sections: []domain.PublishedArchiveMaterialContentPreviewSection{
			{
				ID:       "section_001",
				Title:    "Learning goals",
				Text:     "Practice equivalent fractions.",
				PageHint: "p.1",
			},
		},
		CreatedAt: createdAt,
		UpdatedAt: createdAt.Add(5 * time.Minute),
	}
}
