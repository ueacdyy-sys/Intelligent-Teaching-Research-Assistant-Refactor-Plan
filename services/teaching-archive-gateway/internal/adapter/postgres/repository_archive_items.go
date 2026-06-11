package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func (r *ArchiveRepository) Create(ctx context.Context, item domain.ArchiveItem) (usecase.WritePersistenceOutcome, error) {
	tags, err := json.Marshal(item.Tags)
	if err != nil {
		return usecase.WritePersistenceOutcome{}, err
	}
	intents, err := json.Marshal(item.AnalysisIntents)
	if err != nil {
		return usecase.WritePersistenceOutcome{}, err
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
	if err != nil {
		return usecase.WritePersistenceOutcome{}, err
	}
	return usecase.PersistedWriteOutcome(), nil
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

	queryStart := time.Now()
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
		recordDBQueryTiming(ctx, observableDuration(time.Since(queryStart)))
		return nil, err
	}
	defer func() {
		rows.Close()
		recordDBQueryTiming(ctx, observableDuration(time.Since(queryStart)))
	}()

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

func (r *ArchiveRepository) ListPublishedForStudentApp(ctx context.Context, query domain.ArchiveItemQuery) ([]domain.ArchiveItem, error) {
	args := make([]any, 0, 6)
	clauses := []string{"item.owner_type = " + nextArg(&args, string(domain.OwnerTypeStudent))}

	if query.StudentID != "" {
		clauses = append(clauses, "item.student_id = "+nextArg(&args, query.StudentID))
	}
	if query.MaterialType != "" {
		clauses = append(clauses, "item.material_type = "+nextArg(&args, string(query.MaterialType)))
	}
	if query.SearchText != "" {
		searchArg := nextArg(&args, "%"+escapeLikePattern(query.SearchText)+"%")
		clauses = append(clauses, "(item.title ILIKE "+searchArg+" ESCAPE '\\' OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(item.tags) AS tag(value) WHERE tag.value ILIKE "+searchArg+" ESCAPE '\\'))")
	}
	if query.Cursor != nil {
		createdAtArg := nextArg(&args, query.Cursor.CreatedAt)
		idArg := nextArg(&args, query.Cursor.ID)
		clauses = append(clauses, fmt.Sprintf("(item.created_at, item.id) < (%s, %s)", createdAtArg, idArg))
	}
	limitArg := nextArg(&args, query.FetchLimit)

	queryStart := time.Now()
	rows, err := r.db.Query(ctx, `
		SELECT
			item.id,
			item.owner_type,
			item.student_id,
			item.material_type,
			item.title,
			item.source,
			item.content_ref,
			item.tags,
			item.analysis_intents,
			item.ocr_status,
			item.created_at
		FROM teaching_archive_items AS item
		WHERE `+strings.Join(clauses, " AND ")+`
			AND EXISTS (
				SELECT 1
				FROM teaching_archive_publications AS publication
				WHERE publication.archive_item_id = item.id
					AND publication.student_id = item.student_id
					AND publication.scope_type = 'STUDENT_OWN_ARCHIVE'
					AND publication.publication_state = 'COMMITTED_TO_PUBLICATION_STORE'
					AND publication.visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED'
					AND publication.channel = 'STUDENT_APP'
			)
		ORDER BY item.created_at DESC, item.id DESC
		LIMIT `+limitArg,
		args...,
	)
	if err != nil {
		recordDBQueryTiming(ctx, observableDuration(time.Since(queryStart)))
		return nil, err
	}
	defer func() {
		rows.Close()
		recordDBQueryTiming(ctx, observableDuration(time.Since(queryStart)))
	}()

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

func (r *ArchiveRepository) CountPublishedArchiveMaterialsByType(
	ctx context.Context,
	query domain.ArchiveItemQuery,
) (map[domain.MaterialType]int, error) {
	args := make([]any, 0, 4)
	clauses := []string{"item.owner_type = " + nextArg(&args, string(domain.OwnerTypeStudent))}

	if query.StudentID != "" {
		clauses = append(clauses, "item.student_id = "+nextArg(&args, query.StudentID))
	}
	if query.MaterialType != "" {
		clauses = append(clauses, "item.material_type = "+nextArg(&args, string(query.MaterialType)))
	}
	if query.SearchText != "" {
		searchArg := nextArg(&args, "%"+escapeLikePattern(query.SearchText)+"%")
		clauses = append(clauses, "(item.title ILIKE "+searchArg+" ESCAPE '\\' OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(item.tags) AS tag(value) WHERE tag.value ILIKE "+searchArg+" ESCAPE '\\'))")
	}

	queryStart := time.Now()
	rows, err := r.db.Query(ctx, `
		SELECT
			item.material_type,
			COUNT(*)
		FROM teaching_archive_items AS item
		WHERE `+strings.Join(clauses, " AND ")+`
			AND EXISTS (
				SELECT 1
				FROM teaching_archive_publications AS publication
				WHERE publication.archive_item_id = item.id
					AND publication.student_id = item.student_id
					AND publication.scope_type = 'STUDENT_OWN_ARCHIVE'
					AND publication.publication_state = 'COMMITTED_TO_PUBLICATION_STORE'
					AND publication.visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED'
					AND publication.channel = 'STUDENT_APP'
			)
		GROUP BY item.material_type
	`, args...)
	if err != nil {
		recordDBQueryTiming(ctx, observableDuration(time.Since(queryStart)))
		return nil, err
	}
	defer func() {
		rows.Close()
		recordDBQueryTiming(ctx, observableDuration(time.Since(queryStart)))
	}()

	counts := map[domain.MaterialType]int{}
	for rows.Next() {
		var materialType string
		var count int64
		if err := rows.Scan(&materialType, &count); err != nil {
			return nil, err
		}
		counts[domain.MaterialType(materialType)] = int(count)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return counts, nil
}

func (r *ArchiveRepository) GetPublishedForStudentApp(
	ctx context.Context,
	archiveItemID string,
	studentID string,
) (domain.ArchiveItem, bool, error) {
	queryStart := time.Now()
	rows, err := r.db.Query(ctx, `
		SELECT
			item.id,
			item.owner_type,
			item.student_id,
			item.material_type,
			item.title,
			item.source,
			item.content_ref,
			item.tags,
			item.analysis_intents,
			item.ocr_status,
			item.created_at
		FROM teaching_archive_items AS item
		WHERE item.id = $1
			AND item.owner_type = $2
			AND item.student_id = $3
			AND item.material_type <> 'TEACHING_MATERIAL'
			AND EXISTS (
				SELECT 1
				FROM teaching_archive_publications AS publication
				WHERE publication.archive_item_id = item.id
					AND publication.student_id = item.student_id
					AND publication.scope_type = 'STUDENT_OWN_ARCHIVE'
					AND publication.publication_state = 'COMMITTED_TO_PUBLICATION_STORE'
					AND publication.visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED'
					AND publication.channel = 'STUDENT_APP'
			)
		LIMIT 1
	`,
		archiveItemID,
		string(domain.OwnerTypeStudent),
		studentID,
	)
	if err != nil {
		recordDBQueryTiming(ctx, observableDuration(time.Since(queryStart)))
		return domain.ArchiveItem{}, false, err
	}
	defer func() {
		rows.Close()
		recordDBQueryTiming(ctx, observableDuration(time.Since(queryStart)))
	}()

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

func escapeLikePattern(value string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return replacer.Replace(value)
}

func recordDBQueryTiming(ctx context.Context, duration time.Duration) {
	if timing := platform.TeachingArchiveTimingFromContext(ctx); timing != nil {
		timing.DBQuery = duration
	}
}
