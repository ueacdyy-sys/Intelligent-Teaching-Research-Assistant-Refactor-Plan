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
			source_type,
			source_follow_up_depth,
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
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULLIF($10, ''), $11, NULLIF($12, ''), NULLIF($13, ''), NULLIF($14, ''), NULLIF($15, ''), NULLIF($16, ''), NULLIF($17, ''), $18, $19, NULL, $20)
	`,
		request.ID,
		request.ArchiveItemID,
		request.RequestedByPrincipalID,
		request.AnalysisGoal,
		request.QuestionBankIntent,
		request.Status,
		domain.TutoringAnalysisRequestLearningActionSource(request),
		request.FollowUpDepth,
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
			source_type,
			source_follow_up_depth,
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

func (r *ArchiveRepository) FindPendingStudentAppAITutorResultArchiveFollowUpRequest(
	ctx context.Context,
	query domain.StudentAppAITutorResultArchiveFollowUpPendingRequestQuery,
) (domain.TutoringAnalysisRequest, bool, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			id,
			archive_item_id,
			requested_by_principal_id,
			analysis_goal,
			question_bank_intent,
			status,
			source_type,
			source_follow_up_depth,
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
		WHERE archive_item_id = $1
			AND requested_by_principal_id = $2
			AND question_bank_intent = $3
			AND source_type = $4
			AND source_follow_up_depth = $5
			AND source_archive_student_id = $6
			AND status IN ($7, $8)
		ORDER BY created_at ASC, id ASC
		LIMIT 1
	`,
		query.ArchiveItemID,
		query.RequestedByPrincipalID,
		query.QuestionBankIntent,
		domain.StudentAppAITutorLearningActionSourceResultArchive,
		query.FollowUpDepth,
		query.StudentID,
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
			source_type,
			source_follow_up_depth,
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
	clauses := buildTutoringAnalysisRequestWhereClauses(&args, query)
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
			source_type,
			source_follow_up_depth,
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

func (r *ArchiveRepository) CountTutoringAnalysisRequestsByStatus(
	ctx context.Context,
	query domain.TutoringAnalysisRequestQuery,
) (map[domain.TutoringAnalysisStatus]int, error) {
	args := make([]any, 0, 8)
	clauses := buildTutoringAnalysisRequestWhereClauses(&args, query)

	rows, err := r.db.Query(ctx, `
		SELECT
			status,
			COUNT(*)
		FROM teaching_tutoring_analysis_requests
		WHERE `+strings.Join(clauses, " AND ")+`
		GROUP BY status`,
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := map[domain.TutoringAnalysisStatus]int{}
	for rows.Next() {
		var rawStatus string
		var count int64
		if err := rows.Scan(&rawStatus, &count); err != nil {
			return nil, err
		}
		counts[domain.TutoringAnalysisStatus(rawStatus)] = int(count)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return counts, nil
}

func buildTutoringAnalysisRequestWhereClauses(
	args *[]any,
	query domain.TutoringAnalysisRequestQuery,
) []string {
	clauses := []string{"TRUE"}

	if query.ID != "" {
		clauses = append(clauses, "id = "+nextArg(args, query.ID))
	}
	if query.Status != "" {
		clauses = append(clauses, "status = "+nextArg(args, string(query.Status)))
	}
	if len(query.Statuses) > 0 {
		statuses := make([]string, 0, len(query.Statuses))
		for _, status := range query.Statuses {
			statuses = append(statuses, string(status))
		}
		clauses = append(clauses, "status = ANY("+nextArg(args, statuses)+")")
	}
	if query.ArchiveItemID != "" {
		clauses = append(clauses, "archive_item_id = "+nextArg(args, query.ArchiveItemID))
	}
	if query.RequestedByPrincipalID != "" {
		clauses = append(clauses, "requested_by_principal_id = "+nextArg(args, query.RequestedByPrincipalID))
	}
	if query.SourceArchiveOwnerType != "" {
		clauses = append(clauses, "source_archive_owner_type = "+nextArg(args, string(query.SourceArchiveOwnerType)))
	}
	if query.StudentID != "" {
		clauses = append(clauses, "source_archive_student_id = "+nextArg(args, query.StudentID))
	}
	if len(query.StudentIDs) > 0 {
		clauses = append(clauses, "source_archive_student_id = ANY("+nextArg(args, query.StudentIDs)+")")
	}
	if query.RequireQuestionBankDraftRef {
		clauses = append(clauses, "question_bank_draft_ref IS NOT NULL")
	}
	return clauses
}
