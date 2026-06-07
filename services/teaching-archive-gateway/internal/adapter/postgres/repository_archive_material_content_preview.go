package postgres

import (
	"context"
	"encoding/json"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) SavePublishedArchiveMaterialContentPreview(
	ctx context.Context,
	preview domain.PublishedArchiveMaterialContentPreview,
) error {
	normalized, err := domain.NormalizePublishedArchiveMaterialContentPreview(preview)
	if err != nil {
		return err
	}
	sections, err := json.Marshal(normalized.Sections)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(ctx, `
		INSERT INTO teaching_archive_material_content_previews (
			archive_item_id,
			student_id,
			material_type,
			title,
			preview_status,
			preview_source,
			preview_sections,
			created_at,
			updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
		ON CONFLICT (archive_item_id) DO UPDATE
		SET
			student_id = EXCLUDED.student_id,
			material_type = EXCLUDED.material_type,
			title = EXCLUDED.title,
			preview_status = EXCLUDED.preview_status,
			preview_source = EXCLUDED.preview_source,
			preview_sections = EXCLUDED.preview_sections,
			updated_at = EXCLUDED.updated_at
	`,
		normalized.ArchiveItemID,
		normalized.StudentID,
		normalized.MaterialType,
		normalized.Title,
		normalized.Status,
		normalized.PreviewSource,
		sections,
		normalized.CreatedAt,
		normalized.UpdatedAt,
	)
	return err
}

func (r *ArchiveRepository) GetPublishedContentPreviewForStudentApp(
	ctx context.Context,
	archiveItemID string,
	studentID string,
) (domain.PublishedArchiveMaterialContentPreview, bool, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			preview.archive_item_id,
			preview.student_id,
			preview.material_type,
			preview.title,
			preview.preview_status,
			preview.preview_source,
			preview.preview_sections,
			preview.created_at,
			preview.updated_at
		FROM teaching_archive_material_content_previews AS preview
		WHERE preview.archive_item_id = $1
			AND preview.student_id = $2
			AND preview.preview_status = 'READY'
			AND EXISTS (
				SELECT 1
				FROM teaching_archive_publications AS publication
				WHERE publication.archive_item_id = preview.archive_item_id
					AND publication.student_id = preview.student_id
					AND publication.material_type = preview.material_type
					AND publication.scope_type = 'STUDENT_OWN_ARCHIVE'
					AND publication.publication_state = 'COMMITTED_TO_PUBLICATION_STORE'
					AND publication.visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED'
					AND publication.channel = 'STUDENT_APP'
			)
		LIMIT 1
	`, archiveItemID, studentID)
	if err != nil {
		return domain.PublishedArchiveMaterialContentPreview{}, false, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return domain.PublishedArchiveMaterialContentPreview{}, false, err
		}
		return domain.PublishedArchiveMaterialContentPreview{}, false, nil
	}
	preview, err := scanPublishedArchiveMaterialContentPreview(rows)
	if err != nil {
		return domain.PublishedArchiveMaterialContentPreview{}, false, err
	}
	if err := rows.Err(); err != nil {
		return domain.PublishedArchiveMaterialContentPreview{}, false, err
	}
	return preview, true, nil
}

func scanPublishedArchiveMaterialContentPreview(
	rows Rows,
) (domain.PublishedArchiveMaterialContentPreview, error) {
	var (
		preview       domain.PublishedArchiveMaterialContentPreview
		materialType  string
		status        string
		previewSource string
		sections      []byte
	)
	if err := rows.Scan(
		&preview.ArchiveItemID,
		&preview.StudentID,
		&materialType,
		&preview.Title,
		&status,
		&previewSource,
		&sections,
		&preview.CreatedAt,
		&preview.UpdatedAt,
	); err != nil {
		return domain.PublishedArchiveMaterialContentPreview{}, err
	}
	preview.MaterialType = domain.MaterialType(materialType)
	preview.Status = domain.PublishedArchiveMaterialContentPreviewStatus(status)
	preview.PreviewSource = domain.PublishedArchiveMaterialContentPreviewSource(previewSource)
	if err := json.Unmarshal(sections, &preview.Sections); err != nil {
		return domain.PublishedArchiveMaterialContentPreview{}, err
	}
	return domain.NormalizePublishedArchiveMaterialContentPreview(preview)
}
