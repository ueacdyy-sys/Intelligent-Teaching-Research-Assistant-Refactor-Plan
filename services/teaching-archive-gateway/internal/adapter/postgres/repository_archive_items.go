package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
)

func (r *ArchiveRepository) Create(ctx context.Context, item domain.ArchiveItem) error {
	tags, err := json.Marshal(item.Tags)
	if err != nil {
		return err
	}
	intents, err := json.Marshal(item.AnalysisIntents)
	if err != nil {
		return err
	}

	insertStart := time.Now()
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
	recordDBInsertTiming(ctx, observableDuration(time.Since(insertStart)))
	return err
}

func recordDBInsertTiming(ctx context.Context, duration time.Duration) {
	if timing := platform.TeachingArchiveTimingFromContext(ctx); timing != nil {
		timing.DBInsert = duration
	}
}

func observableDuration(duration time.Duration) time.Duration {
	if duration <= 0 {
		return time.Nanosecond
	}
	return duration
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
