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

func TestListPublishedForStudentAppSearchesOnlyInsidePublicationProjection(t *testing.T) {
	db := &recordingDB{rows: &singleTeachingArchiveMaterialDraftItemRow{}}
	repository := postgres.NewArchiveRepository(db)

	_, err := repository.ListPublishedForStudentApp(context.Background(), domain.ArchiveItemQuery{
		OwnerType:    domain.OwnerTypeStudent,
		StudentID:    "student_001",
		MaterialType: domain.MaterialTypeHandout,
		SearchText:   "fractions_% packet",
		PageSize:     10,
		FetchLimit:   11,
	})
	if err != nil {
		t.Fatalf("ListPublishedForStudentApp returned error: %v", err)
	}
	for _, fragment := range []string{
		"FROM teaching_archive_publications AS publication",
		"publication.visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED'",
		"item.title ILIKE $4 ESCAPE '\\'",
		"jsonb_array_elements_text(item.tags) AS tag(value)",
		"tag.value ILIKE $4 ESCAPE '\\'",
		"LIMIT $5",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 5 ||
		db.args[0] != string(domain.OwnerTypeStudent) ||
		db.args[1] != "student_001" ||
		db.args[2] != string(domain.MaterialTypeHandout) ||
		db.args[3] != `%fractions\_\% packet%` ||
		db.args[4] != 11 {
		t.Fatalf("args = %#v", db.args)
	}
}

func TestListArchiveItemsDoesNotApplyStudentAppSearchText(t *testing.T) {
	db := &recordingDB{}
	repository := postgres.NewArchiveRepository(db)

	_, err := repository.List(context.Background(), domain.ArchiveItemQuery{
		OwnerType:  domain.OwnerTypeStudent,
		StudentID:  "student_001",
		SearchText: "fractions",
		FetchLimit: 10,
	})
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	for _, forbidden := range []string{"ILIKE", "jsonb_array_elements_text", "fractions"} {
		if strings.Contains(db.lastSQL, forbidden) {
			t.Fatalf("generic List must not apply Student App search fragment %q in: %s", forbidden, db.lastSQL)
		}
	}
	if len(db.args) != 3 ||
		db.args[0] != string(domain.OwnerTypeStudent) ||
		db.args[1] != "student_001" ||
		db.args[2] != 10 {
		t.Fatalf("args = %#v", db.args)
	}
}

func TestGetPublishedForStudentAppUsesPublicationProjectionFilter(t *testing.T) {
	db := &recordingDB{rows: &singleTeachingArchiveMaterialDraftItemRow{}}
	repository := postgres.NewArchiveRepository(db)

	item, ok, err := repository.GetPublishedForStudentApp(
		context.Background(),
		"tarch_archive_material_001",
		"student_001",
	)
	if err != nil {
		t.Fatalf("GetPublishedForStudentApp returned error: %v", err)
	}
	if !ok {
		t.Fatalf("ok = false, want true")
	}
	if item.ID != "tarch_archive_material_001" || item.StudentID != "student_001" {
		t.Fatalf("item = %#v", item)
	}
	for _, fragment := range []string{
		"FROM teaching_archive_items AS item",
		"WHERE item.id = $1",
		"item.owner_type = $2",
		"item.student_id = $3",
		"item.material_type <> 'TEACHING_MATERIAL'",
		"EXISTS",
		"FROM teaching_archive_publications AS publication",
		"publication.archive_item_id = item.id",
		"publication.student_id = item.student_id",
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
	for _, forbidden := range []string{
		"FROM teaching_archive_items\n\t\tWHERE id = $1",
		"GetByID",
	} {
		if strings.Contains(db.lastSQL, forbidden) {
			t.Fatalf("detail SQL must not use generic get fragment %q in: %s", forbidden, db.lastSQL)
		}
	}
	if len(db.args) != 3 ||
		db.args[0] != "tarch_archive_material_001" ||
		db.args[1] != string(domain.OwnerTypeStudent) ||
		db.args[2] != "student_001" {
		t.Fatalf("args = %#v", db.args)
	}
}
