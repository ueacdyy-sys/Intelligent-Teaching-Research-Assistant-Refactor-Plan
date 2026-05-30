package postgres

import (
	"context"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) ClaimNextAIGradingRequest(
	ctx context.Context,
	input domain.ClaimAIGradingRequestInput,
	now time.Time,
) (domain.AIGradingRequest, bool, error) {
	normalized, claimExpiresAt, err := domain.BuildAIGradingClaimLease(input, now)
	if err != nil {
		return domain.AIGradingRequest{}, false, err
	}
	claimedAt := now.UTC()

	rows, err := r.db.Query(ctx, `
		UPDATE teaching_ai_grading_requests
		SET
			status = $1,
			claimed_by_worker_id = $2,
			claim_expires_at = $3,
			updated_at = $4
		WHERE id = (
			SELECT id
			FROM teaching_ai_grading_requests
			WHERE status = $5
				OR (status = $6 AND claim_expires_at <= $4)
			ORDER BY created_at ASC, id ASC
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		RETURNING
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
	`,
		domain.AIGradingStatusInProgress,
		normalized.WorkerID,
		claimExpiresAt,
		claimedAt,
		domain.AIGradingStatusQueued,
		domain.AIGradingStatusInProgress,
	)
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
