package postgres

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) GetAIGradingRequestByID(
	ctx context.Context,
	id string,
) (domain.AIGradingRequest, bool, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			id,
			archive_item_id,
			requested_by_principal_id,
			grading_instructions,
			rubric_ref,
			status,
			source_archive_owner_type,
			source_archive_student_id,
			source_archive_content_ref,
			source_quiz_submission_id,
			source_answer_ref,
			source_archive_material,
			source_archive_ocr_status,
			score_summary,
			result_ref,
			error_code,
			error_message,
			claimed_by_worker_id,
			claim_expires_at,
			created_at,
			completed_at,
			updated_at
		FROM teaching_ai_grading_requests
		WHERE id = $1
		LIMIT 1
	`, id)
	if err != nil {
		return domain.AIGradingRequest{}, false, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return domain.AIGradingRequest{}, false, err
		}
		return domain.AIGradingRequest{}, false, nil
	}
	request, err := scanAIGradingRequest(rows)
	if err != nil {
		return domain.AIGradingRequest{}, false, err
	}
	if err := rows.Err(); err != nil {
		return domain.AIGradingRequest{}, false, err
	}
	return request, true, nil
}

func (r *ArchiveRepository) RecordAIGradingResult(
	ctx context.Context,
	request domain.AIGradingRequest,
) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE teaching_ai_grading_requests
		SET
			status = $1,
			score_summary = NULLIF($2, ''),
			result_ref = NULLIF($3, ''),
			error_code = NULLIF($4, ''),
			error_message = NULLIF($5, ''),
			completed_at = $6,
			updated_at = $7
		WHERE id = $8
			AND status = $9
			AND claimed_by_worker_id = $10
			AND claim_expires_at > $11
	`,
		request.Status,
		request.ScoreSummary,
		request.ResultRef,
		request.ErrorCode,
		request.ErrorMessage,
		request.CompletedAt,
		request.UpdatedAt,
		request.ID,
		domain.AIGradingStatusInProgress,
		request.ClaimedByWorkerID,
		request.CompletedAt,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrConflict
	}
	return nil
}
