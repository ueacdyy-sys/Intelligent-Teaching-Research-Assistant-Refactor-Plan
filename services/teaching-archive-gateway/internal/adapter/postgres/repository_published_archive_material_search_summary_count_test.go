package postgres_test

import (
	"context"
	"strings"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestCountPublishedArchiveMaterialsByTypeBuildsCountOnlyProjectionQuery(t *testing.T) {
	db := &recordingDB{
		rows: &materialTypeCountRows{
			rows: []materialTypeCountRow{
				{materialType: string(domain.MaterialTypeHandout), count: 2},
				{materialType: string(domain.MaterialTypeHomework), count: 1},
			},
		},
	}
	repository := postgres.NewArchiveRepository(db)

	counts, err := repository.CountPublishedArchiveMaterialsByType(
		context.Background(),
		domain.ArchiveItemQuery{
			OwnerType:    domain.OwnerTypeStudent,
			StudentID:    "student_001",
			MaterialType: domain.MaterialTypeHandout,
			SearchText:   "fractions_% packet",
		},
	)
	if err != nil {
		t.Fatalf("CountPublishedArchiveMaterialsByType returned error: %v", err)
	}
	for _, fragment := range []string{
		"SELECT",
		"item.material_type",
		"COUNT(*)",
		"FROM teaching_archive_items AS item",
		"item.owner_type = $1",
		"item.student_id = $2",
		"item.material_type = $3",
		"item.title ILIKE $4 ESCAPE '\\'",
		"jsonb_array_elements_text(item.tags) AS tag(value)",
		"FROM teaching_archive_publications AS publication",
		"publication.archive_item_id = item.id",
		"publication.visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED'",
		"publication.channel = 'STUDENT_APP'",
		"GROUP BY item.material_type",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	for _, forbidden := range []string{
		"ORDER BY",
		"LIMIT",
		"item.content_ref",
		"item.analysis_intents",
		"item.ocr_status",
		"scanArchiveItem",
	} {
		if strings.Contains(db.lastSQL, forbidden) {
			t.Fatalf("SQL includes forbidden %q in: %s", forbidden, db.lastSQL)
		}
	}
	if len(db.args) != 4 ||
		db.args[0] != string(domain.OwnerTypeStudent) ||
		db.args[1] != "student_001" ||
		db.args[2] != string(domain.MaterialTypeHandout) ||
		db.args[3] != `%fractions\_\% packet%` {
		t.Fatalf("args = %#v", db.args)
	}
	if counts[domain.MaterialTypeHandout] != 2 || counts[domain.MaterialTypeHomework] != 1 {
		t.Fatalf("counts = %#v", counts)
	}
}

type materialTypeCountRow struct {
	materialType string
	count        int64
}

type materialTypeCountRows struct {
	rows  []materialTypeCountRow
	index int
}

func (r *materialTypeCountRows) Close() {}

func (r *materialTypeCountRows) Next() bool {
	if r.index >= len(r.rows) {
		return false
	}
	r.index++
	return true
}

func (r *materialTypeCountRows) Scan(dest ...any) error {
	row := r.rows[r.index-1]
	*(dest[0].(*string)) = row.materialType
	*(dest[1].(*int64)) = row.count
	return nil
}

func (r *materialTypeCountRows) Err() error {
	return nil
}
