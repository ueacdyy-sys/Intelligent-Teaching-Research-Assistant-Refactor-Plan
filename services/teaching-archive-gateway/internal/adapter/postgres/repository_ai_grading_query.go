package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) ListAIGradingRequests(
	ctx context.Context,
	query domain.AIGradingRequestQuery,
) ([]domain.AIGradingRequest, error) {
	args := make([]any, 0, 7)
	clauses := []string{"TRUE"}

	if query.Status != "" {
		clauses = append(clauses, "status = "+nextArg(&args, string(query.Status)))
	}
	if query.ArchiveItemID != "" {
		clauses = append(clauses, "archive_item_id = "+nextArg(&args, query.ArchiveItemID))
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
			grading_instructions,
			rubric_ref,
			status,
			source_archive_owner_type,
			source_archive_student_id,
			source_archive_material,
			source_archive_ocr_status,
			created_at,
			updated_at
		FROM teaching_ai_grading_requests
		WHERE `+strings.Join(clauses, " AND ")+`
		ORDER BY created_at DESC, id DESC
		LIMIT `+limitArg,
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	requests := make([]domain.AIGradingRequest, 0, query.FetchLimit)
	for rows.Next() {
		request, err := scanAIGradingRequest(rows)
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

func scanAIGradingRequest(rows Rows) (domain.AIGradingRequest, error) {
	var (
		request  domain.AIGradingRequest
		rubric   sql.NullString
		status   string
		owner    string
		student  sql.NullString
		material string
		ocr      string
	)
	if err := rows.Scan(
		&request.ID,
		&request.ArchiveItemID,
		&request.RequestedByPrincipalID,
		&request.GradingInstructions,
		&rubric,
		&status,
		&owner,
		&student,
		&material,
		&ocr,
		&request.CreatedAt,
		&request.UpdatedAt,
	); err != nil {
		return domain.AIGradingRequest{}, err
	}
	if rubric.Valid {
		request.RubricRef = rubric.String
	}
	request.Status = domain.AIGradingStatus(status)
	request.SourceArchiveOwnerType = domain.OwnerType(owner)
	if student.Valid {
		request.SourceArchiveStudentID = student.String
	}
	request.SourceArchiveMaterial = domain.MaterialType(material)
	request.SourceArchiveOCRStatus = domain.OCRStatus(ocr)
	return request, nil
}
