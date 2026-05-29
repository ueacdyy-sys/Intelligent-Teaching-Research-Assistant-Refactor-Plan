package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type CommandTag interface {
	RowsAffected() int64
}

type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (Rows, error)
}

type Rows interface {
	Close()
	Next() bool
	Scan(dest ...any) error
	Err() error
}

type ArchiveRepository struct {
	db DB
}

func NewArchiveRepository(db DB) *ArchiveRepository {
	return &ArchiveRepository{db: db}
}

func EnsureSchema(ctx context.Context, db DB) error {
	for _, statement := range schemaStatements {
		if _, err := db.Exec(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}

func (r *ArchiveRepository) Create(ctx context.Context, item domain.ArchiveItem) error {
	tags, err := json.Marshal(item.Tags)
	if err != nil {
		return err
	}
	intents, err := json.Marshal(item.AnalysisIntents)
	if err != nil {
		return err
	}

	_, err = r.db.Exec(ctx, `
		INSERT INTO teaching_archive_items (
			id,
			owner_type,
			student_id,
			material_type,
			title,
			source,
			content_ref,
			tags,
			analysis_intents,
			ocr_status,
			created_at
		) VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
	`,
		item.ID,
		item.OwnerType,
		item.StudentID,
		item.MaterialType,
		item.Title,
		item.Source,
		item.ContentRef,
		tags,
		intents,
		item.OCRStatus,
		item.CreatedAt,
	)
	return err
}

func (r *ArchiveRepository) GetByID(ctx context.Context, id string) (domain.ArchiveItem, bool, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			id,
			owner_type,
			student_id,
			material_type,
			title,
			source,
			content_ref,
			tags,
			analysis_intents,
			ocr_status,
			created_at
		FROM teaching_archive_items
		WHERE id = $1
		LIMIT 1
	`, id)
	if err != nil {
		return domain.ArchiveItem{}, false, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return domain.ArchiveItem{}, false, err
		}
		return domain.ArchiveItem{}, false, nil
	}
	item, err := scanArchiveItem(rows)
	if err != nil {
		return domain.ArchiveItem{}, false, err
	}
	if err := rows.Err(); err != nil {
		return domain.ArchiveItem{}, false, err
	}
	return item, true, nil
}

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

func (r *ArchiveRepository) List(ctx context.Context, query domain.ArchiveItemQuery) ([]domain.ArchiveItem, error) {
	args := make([]any, 0, 6)
	clauses := []string{"TRUE"}

	if query.OwnerType != "" {
		clauses = append(clauses, "owner_type = "+nextArg(&args, string(query.OwnerType)))
	}
	if query.StudentID != "" {
		clauses = append(clauses, "student_id = "+nextArg(&args, query.StudentID))
	}
	if len(query.StudentIDs) > 0 {
		clauses = append(clauses, "student_id = ANY("+nextArg(&args, query.StudentIDs)+")")
	}
	if query.MaterialType != "" {
		clauses = append(clauses, "material_type = "+nextArg(&args, string(query.MaterialType)))
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
			owner_type,
			student_id,
			material_type,
			title,
			source,
			content_ref,
			tags,
			analysis_intents,
			ocr_status,
			created_at
		FROM teaching_archive_items
		WHERE `+strings.Join(clauses, " AND ")+`
		ORDER BY created_at DESC, id DESC
		LIMIT `+limitArg,
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]domain.ArchiveItem, 0, query.FetchLimit)
	for rows.Next() {
		item, err := scanArchiveItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func nextArg(args *[]any, value any) string {
	*args = append(*args, value)
	return fmt.Sprintf("$%d", len(*args))
}

func scanArchiveItem(rows Rows) (domain.ArchiveItem, error) {
	var (
		item      domain.ArchiveItem
		ownerType string
		studentID sql.NullString
		material  string
		source    string
		tags      []byte
		intents   []byte
		ocrStatus string
	)
	if err := rows.Scan(
		&item.ID,
		&ownerType,
		&studentID,
		&material,
		&item.Title,
		&source,
		&item.ContentRef,
		&tags,
		&intents,
		&ocrStatus,
		&item.CreatedAt,
	); err != nil {
		return domain.ArchiveItem{}, err
	}
	if studentID.Valid {
		item.StudentID = studentID.String
	}
	item.OwnerType = domain.OwnerType(ownerType)
	item.MaterialType = domain.MaterialType(material)
	item.Source = domain.Source(source)
	item.OCRStatus = domain.OCRStatus(ocrStatus)
	if err := json.Unmarshal(tags, &item.Tags); err != nil {
		return domain.ArchiveItem{}, err
	}
	if err := json.Unmarshal(intents, &item.AnalysisIntents); err != nil {
		return domain.ArchiveItem{}, err
	}
	return item, nil
}

func scanTutoringAnalysisRequest(rows Rows) (domain.TutoringAnalysisRequest, error) {
	var (
		request       domain.TutoringAnalysisRequest
		questionBank  string
		status        string
		ownerType     string
		studentID     sql.NullString
		material      string
		resultSummary sql.NullString
		resultRef     sql.NullString
		draftRef      sql.NullString
		errorCode     sql.NullString
		errorMessage  sql.NullString
		claimWorkerID sql.NullString
		claimExpires  sql.NullTime
		completedAt   sql.NullTime
		updatedAt     sql.NullTime
	)
	if err := rows.Scan(
		&request.ID,
		&request.ArchiveItemID,
		&request.RequestedByPrincipalID,
		&request.AnalysisGoal,
		&questionBank,
		&status,
		&ownerType,
		&studentID,
		&material,
		&resultSummary,
		&resultRef,
		&draftRef,
		&errorCode,
		&errorMessage,
		&claimWorkerID,
		&claimExpires,
		&request.CreatedAt,
		&completedAt,
		&updatedAt,
	); err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}
	request.QuestionBankIntent = domain.QuestionBankIntent(questionBank)
	request.Status = domain.TutoringAnalysisStatus(status)
	request.SourceArchiveOwnerType = domain.OwnerType(ownerType)
	if studentID.Valid {
		request.SourceArchiveStudentID = studentID.String
	}
	request.SourceArchiveMaterial = domain.MaterialType(material)
	if resultSummary.Valid {
		request.ResultSummary = resultSummary.String
	}
	if resultRef.Valid {
		request.ResultRef = resultRef.String
	}
	if draftRef.Valid {
		request.QuestionBankDraftRef = draftRef.String
	}
	if errorCode.Valid {
		request.ErrorCode = errorCode.String
	}
	if errorMessage.Valid {
		request.ErrorMessage = errorMessage.String
	}
	if claimWorkerID.Valid {
		request.ClaimedByWorkerID = claimWorkerID.String
	}
	if claimExpires.Valid {
		request.ClaimExpiresAt = claimExpires.Time
	}
	if completedAt.Valid {
		request.CompletedAt = completedAt.Time
	}
	if updatedAt.Valid {
		request.UpdatedAt = updatedAt.Time
	}
	return request, nil
}

var schemaStatements = []string{
	`CREATE TABLE IF NOT EXISTS teaching_archive_items (
		id TEXT PRIMARY KEY,
		owner_type TEXT NOT NULL,
		student_id TEXT,
		material_type TEXT NOT NULL,
		title TEXT NOT NULL,
		source TEXT NOT NULL,
		content_ref TEXT NOT NULL,
		tags JSONB NOT NULL DEFAULT '[]'::jsonb,
		analysis_intents JSONB NOT NULL DEFAULT '[]'::jsonb,
		ocr_status TEXT NOT NULL,
		created_at TIMESTAMPTZ NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_student_created
		ON teaching_archive_items (student_id, created_at DESC)
		WHERE student_id IS NOT NULL`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_owner_created
		ON teaching_archive_items (owner_type, created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_material_created
		ON teaching_archive_items (material_type, created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_created_page
		ON teaching_archive_items (created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_student_page
		ON teaching_archive_items (student_id, created_at DESC, id DESC)
		WHERE student_id IS NOT NULL`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_owner_page
		ON teaching_archive_items (owner_type, created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_material_page
		ON teaching_archive_items (material_type, created_at DESC, id DESC)`,
	`CREATE TABLE IF NOT EXISTS teaching_ai_grading_requests (
		id TEXT PRIMARY KEY,
		archive_item_id TEXT NOT NULL REFERENCES teaching_archive_items(id),
		requested_by_principal_id TEXT NOT NULL,
		grading_instructions TEXT NOT NULL,
		rubric_ref TEXT,
		status TEXT NOT NULL,
		source_archive_owner_type TEXT NOT NULL,
		source_archive_student_id TEXT,
			source_archive_material TEXT NOT NULL,
			source_archive_ocr_status TEXT NOT NULL,
			claimed_by_worker_id TEXT,
			claim_expires_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL
	)`,
	`ALTER TABLE teaching_ai_grading_requests
		ADD COLUMN IF NOT EXISTS claimed_by_worker_id TEXT`,
	`ALTER TABLE teaching_ai_grading_requests
		ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_archive_created
		ON teaching_ai_grading_requests (archive_item_id, created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_archive_page
		ON teaching_ai_grading_requests (archive_item_id, created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_status_created
		ON teaching_ai_grading_requests (status, created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_source_owner_created
		ON teaching_ai_grading_requests (source_archive_owner_type, created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_source_student_created
		ON teaching_ai_grading_requests (source_archive_student_id, created_at DESC, id DESC)
		WHERE source_archive_student_id IS NOT NULL`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_created_page
		ON teaching_ai_grading_requests (created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_claim_eligible
		ON teaching_ai_grading_requests (status, claim_expires_at, created_at, id)`,
	`CREATE TABLE IF NOT EXISTS teaching_tutoring_analysis_requests (
		id TEXT PRIMARY KEY,
		archive_item_id TEXT NOT NULL REFERENCES teaching_archive_items(id),
		requested_by_principal_id TEXT NOT NULL,
		analysis_goal TEXT NOT NULL,
		question_bank_intent TEXT NOT NULL,
		status TEXT NOT NULL,
		source_archive_owner_type TEXT NOT NULL,
		source_archive_student_id TEXT,
		source_archive_material TEXT NOT NULL,
		result_summary TEXT,
		result_ref TEXT,
		question_bank_draft_ref TEXT,
		error_code TEXT,
		error_message TEXT,
		claimed_by_worker_id TEXT,
		claim_expires_at TIMESTAMPTZ,
		created_at TIMESTAMPTZ NOT NULL,
		completed_at TIMESTAMPTZ,
		updated_at TIMESTAMPTZ
	)`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS result_summary TEXT`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS result_ref TEXT`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS question_bank_draft_ref TEXT`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS error_code TEXT`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS error_message TEXT`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS claimed_by_worker_id TEXT`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_archive_created
		ON teaching_tutoring_analysis_requests (archive_item_id, created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_principal_created
		ON teaching_tutoring_analysis_requests (requested_by_principal_id, created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_status_created
		ON teaching_tutoring_analysis_requests (status, created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_claim_eligible
		ON teaching_tutoring_analysis_requests (status, claim_expires_at, created_at, id)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_source_owner_created
		ON teaching_tutoring_analysis_requests (source_archive_owner_type, created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_source_student_created
		ON teaching_tutoring_analysis_requests (source_archive_student_id, created_at DESC, id DESC)
		WHERE source_archive_student_id IS NOT NULL`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_created_page
		ON teaching_tutoring_analysis_requests (created_at DESC, id DESC)`,
}

func nullTime(value time.Time) any {
	if value.IsZero() {
		return nil
	}
	return value.UTC()
}
