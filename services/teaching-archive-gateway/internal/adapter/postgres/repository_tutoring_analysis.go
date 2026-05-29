package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) CreateTutoringAnalysisRequest(
	ctx context.Context,
	request domain.TutoringAnalysisRequest,
) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO teaching_tutoring_analysis_requests (
			id,
			archive_item_id,
			requested_by_principal_id,
			analysis_goal,
			question_bank_intent,
			status,
			source_archive_owner_type,
			source_archive_student_id,
			source_archive_material,
			result_summary,
			result_ref,
			question_bank_draft_ref,
			error_code,
			error_message,
			claimed_by_worker_id,
			claim_expires_at,
			created_at,
			completed_at,
			updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, ''), $9, NULLIF($10, ''), NULLIF($11, ''), NULLIF($12, ''), NULLIF($13, ''), NULLIF($14, ''), NULLIF($15, ''), $16, $17, NULL, $18)
	`,
		request.ID,
		request.ArchiveItemID,
		request.RequestedByPrincipalID,
		request.AnalysisGoal,
		request.QuestionBankIntent,
		request.Status,
		request.SourceArchiveOwnerType,
		request.SourceArchiveStudentID,
		request.SourceArchiveMaterial,
		request.ResultSummary,
		request.ResultRef,
		request.QuestionBankDraftRef,
		request.ErrorCode,
		request.ErrorMessage,
		request.ClaimedByWorkerID,
		nullTime(request.ClaimExpiresAt),
		request.CreatedAt,
		request.UpdatedAt,
	)
	return err
}

func (r *ArchiveRepository) GetTutoringAnalysisRequestByID(
	ctx context.Context,
	id string,
) (domain.TutoringAnalysisRequest, bool, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			id,
			archive_item_id,
			requested_by_principal_id,
			analysis_goal,
			question_bank_intent,
			status,
			source_archive_owner_type,
			source_archive_student_id,
			source_archive_material,
			result_summary,
			result_ref,
			question_bank_draft_ref,
			error_code,
			error_message,
			claimed_by_worker_id,
			claim_expires_at,
			created_at,
			completed_at,
			updated_at
		FROM teaching_tutoring_analysis_requests
		WHERE id = $1
		LIMIT 1
	`, id)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, false, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return domain.TutoringAnalysisRequest{}, false, err
		}
		return domain.TutoringAnalysisRequest{}, false, nil
	}
	request, err := scanTutoringAnalysisRequest(rows)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, false, err
	}
	if err := rows.Err(); err != nil {
		return domain.TutoringAnalysisRequest{}, false, err
	}
	return request, true, nil
}

func (r *ArchiveRepository) ClaimNextTutoringAnalysisRequest(
	ctx context.Context,
	input domain.ClaimTutoringAnalysisRequestInput,
	now time.Time,
) (domain.TutoringAnalysisRequest, bool, error) {
	normalized, claimExpiresAt, err := domain.BuildTutoringAnalysisClaimLease(input, now)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, false, err
	}
	claimedAt := now.UTC()

	rows, err := r.db.Query(ctx, `
		UPDATE teaching_tutoring_analysis_requests
		SET
			status = $1,
			claimed_by_worker_id = $2,
			claim_expires_at = $3,
			updated_at = $4
		WHERE id = (
			SELECT id
			FROM teaching_tutoring_analysis_requests
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
			analysis_goal,
			question_bank_intent,
			status,
			source_archive_owner_type,
			source_archive_student_id,
			source_archive_material,
			result_summary,
			result_ref,
			question_bank_draft_ref,
			error_code,
			error_message,
			claimed_by_worker_id,
			claim_expires_at,
			created_at,
			completed_at,
			updated_at
	`,
		domain.TutoringAnalysisStatusInProgress,
		normalized.WorkerID,
		claimExpiresAt,
		claimedAt,
		domain.TutoringAnalysisStatusQueued,
		domain.TutoringAnalysisStatusInProgress,
	)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, false, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return domain.TutoringAnalysisRequest{}, false, err
		}
		return domain.TutoringAnalysisRequest{}, false, nil
	}
	request, err := scanTutoringAnalysisRequest(rows)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, false, err
	}
	if err := rows.Err(); err != nil {
		return domain.TutoringAnalysisRequest{}, false, err
	}
	return request, true, nil
}

func (r *ArchiveRepository) RecordTutoringAnalysisResult(
	ctx context.Context,
	request domain.TutoringAnalysisRequest,
) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE teaching_tutoring_analysis_requests
		SET
			status = $1,
			result_summary = NULLIF($2, ''),
			result_ref = NULLIF($3, ''),
			question_bank_draft_ref = NULLIF($4, ''),
			error_code = NULLIF($5, ''),
			error_message = NULLIF($6, ''),
			completed_at = $7,
			updated_at = $8
		WHERE id = $9
			AND status = $10
			AND claimed_by_worker_id = $11
			AND claim_expires_at > $12
	`,
		request.Status,
		request.ResultSummary,
		request.ResultRef,
		request.QuestionBankDraftRef,
		request.ErrorCode,
		request.ErrorMessage,
		request.CompletedAt,
		request.UpdatedAt,
		request.ID,
		domain.TutoringAnalysisStatusInProgress,
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

func (r *ArchiveRepository) ListTutoringAnalysisRequests(
	ctx context.Context,
	query domain.TutoringAnalysisRequestQuery,
) ([]domain.TutoringAnalysisRequest, error) {
	args := make([]any, 0, 8)
	clauses := []string{"TRUE"}

	if query.Status != "" {
		clauses = append(clauses, "status = "+nextArg(&args, string(query.Status)))
	}
	if query.ArchiveItemID != "" {
		clauses = append(clauses, "archive_item_id = "+nextArg(&args, query.ArchiveItemID))
	}
	if query.RequestedByPrincipalID != "" {
		clauses = append(clauses, "requested_by_principal_id = "+nextArg(&args, query.RequestedByPrincipalID))
	}
	if query.SourceArchiveOwnerType != "" {
		clauses = append(clauses, "source_archive_owner_type = "+nextArg(&args, string(query.SourceArchiveOwnerType)))
	}
	if query.StudentID != "" {
		clauses = append(clauses, "source_archive_student_id = "+nextArg(&args, query.StudentID))
	}
	if len(query.StudentIDs) > 0 {
		clauses = append(clauses, "source_archive_student_id = ANY("+nextArg(&args, query.StudentIDs)+")")
	}
	if query.Cursor != nil {
		createdAtArg := nextArg(&args, query.Cursor.CreatedAt)
		idArg := nextArg(&args, query.Cursor.ID)
		clauses = append(clauses, fmt.Sprintf("(created_at, id) < (%s, %s)", createdAtArg, idArg))
	}
	limitArg := nextArg(&args, query.FetchLimit)

	rows, err := r.db.Query(ctx, `
		SELECT
			id,
			archive_item_id,
			requested_by_principal_id,
			analysis_goal,
			question_bank_intent,
			status,
			source_archive_owner_type,
			source_archive_student_id,
			source_archive_material,
			result_summary,
			result_ref,
			question_bank_draft_ref,
			error_code,
			error_message,
			claimed_by_worker_id,
			claim_expires_at,
			created_at,
			completed_at,
			updated_at
		FROM teaching_tutoring_analysis_requests
		WHERE `+strings.Join(clauses, " AND ")+`
		ORDER BY created_at DESC, id DESC
		LIMIT `+limitArg,
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	requests := make([]domain.TutoringAnalysisRequest, 0, query.FetchLimit)
	for rows.Next() {
		request, err := scanTutoringAnalysisRequest(rows)
		if err != nil {
			return nil, err
		}
		requests = append(requests, request)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return requests, nil
}
