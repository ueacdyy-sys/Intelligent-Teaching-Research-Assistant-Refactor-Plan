package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

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
			created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, ''), $9, $10)
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
		request.CreatedAt,
	)
	return err
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
		created_at TIMESTAMPTZ NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_archive_created
		ON teaching_tutoring_analysis_requests (archive_item_id, created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_principal_created
		ON teaching_tutoring_analysis_requests (requested_by_principal_id, created_at DESC)`,
}
