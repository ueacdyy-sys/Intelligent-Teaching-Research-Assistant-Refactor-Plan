package postgres_test

import (
	"context"
	"strings"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestListPublishedForStudentAppUsesPublicationProjectionFilter(t *testing.T) {
	db := &recordingDB{rows: &singleTeachingArchiveMaterialDraftItemRow{}}
	repository := postgres.NewArchiveRepository(db)

	items, err := repository.ListPublishedForStudentApp(context.Background(), domain.ArchiveItemQuery{
		OwnerType:    domain.OwnerTypeStudent,
		StudentID:    "student_001",
		MaterialType: domain.MaterialTypeHandout,
		PageSize:     10,
		FetchLimit:   11,
	})
	if err != nil {
		t.Fatalf("ListPublishedForStudentApp returned error: %v", err)
	}
	if len(items) != 1 || items[0].ID != "tarch_archive_material_001" {
		t.Fatalf("items = %#v", items)
	}
	for _, fragment := range []string{
		"FROM teaching_archive_items AS item",
		"EXISTS",
		"FROM teaching_archive_publications AS publication",
		"publication.archive_item_id = item.id",
		"publication.student_id = item.student_id",
		"publication.scope_type = 'STUDENT_OWN_ARCHIVE'",
		"publication.publication_state = 'COMMITTED_TO_PUBLICATION_STORE'",
		"publication.visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED'",
		"publication.channel = 'STUDENT_APP'",
		"ORDER BY item.created_at DESC, item.id DESC",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 4 ||
		db.args[0] != string(domain.OwnerTypeStudent) ||
		db.args[1] != "student_001" ||
		db.args[2] != string(domain.MaterialTypeHandout) ||
		db.args[3] != 11 {
		t.Fatalf("args = %#v", db.args)
	}
}
