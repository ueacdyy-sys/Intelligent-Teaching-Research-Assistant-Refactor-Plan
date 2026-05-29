package postgres

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) CreateAIGradingRequest(
	ctx context.Context,
	request domain.AIGradingRequest,
) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO teaching_ai_grading_requests (
			id,
			archive_item_id,
			requested_by_principal_id,
			grading_instructions,
			rubric_ref,
			status,
			source_archive_owner_type,
			source_archive_student_id,
			source_archive_material,
			source_archive_ocr_status,
			created_at,
			updated_at
		) VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7, NULLIF($8, ''), $9, $10, $11, $12)
	`,
		request.ID,
		request.ArchiveItemID,
		request.RequestedByPrincipalID,
		request.GradingInstructions,
		request.RubricRef,
		request.Status,
		request.SourceArchiveOwnerType,
		request.SourceArchiveStudentID,
		request.SourceArchiveMaterial,
		request.SourceArchiveOCRStatus,
		request.CreatedAt,
		request.UpdatedAt,
	)
	return err
}
