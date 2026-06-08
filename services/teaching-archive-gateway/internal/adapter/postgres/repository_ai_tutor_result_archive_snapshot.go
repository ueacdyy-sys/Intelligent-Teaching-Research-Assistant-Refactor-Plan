package postgres

import (
	"context"
	"encoding/json"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) GetStudentAppAITutorResultArchiveSnapshot(
	ctx context.Context,
	archiveItemID string,
	studentID string,
) (domain.StudentAppAITutorResultArchiveSnapshot, bool, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			snapshot.archive_item_id,
			snapshot.student_id,
			snapshot.summary,
			snapshot.guidance_sections,
			snapshot.guidance_sections_hash,
			snapshot.safety_labels,
			snapshot.safe_guidance_only
		FROM teaching_ai_tutor_result_archive_snapshots AS snapshot
		WHERE snapshot.archive_item_id = $1
			AND snapshot.student_id = $2
			AND snapshot.safe_guidance_only = TRUE
		LIMIT 1
	`, archiveItemID, studentID)
	if err != nil {
		return domain.StudentAppAITutorResultArchiveSnapshot{}, false, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return domain.StudentAppAITutorResultArchiveSnapshot{}, false, err
		}
		return domain.StudentAppAITutorResultArchiveSnapshot{}, false, nil
	}
	snapshot, err := scanStudentAppAITutorResultArchiveSnapshot(rows)
	if err != nil {
		return domain.StudentAppAITutorResultArchiveSnapshot{}, false, err
	}
	if err := rows.Err(); err != nil {
		return domain.StudentAppAITutorResultArchiveSnapshot{}, false, err
	}
	return snapshot, true, nil
}

func scanStudentAppAITutorResultArchiveSnapshot(
	rows Rows,
) (domain.StudentAppAITutorResultArchiveSnapshot, error) {
	var (
		snapshot domain.StudentAppAITutorResultArchiveSnapshot
		sections []byte
		labels   []byte
	)
	if err := rows.Scan(
		&snapshot.ArchiveItemID,
		&snapshot.StudentID,
		&snapshot.Summary,
		&sections,
		&snapshot.GuidanceSectionsHash,
		&labels,
		&snapshot.SafeGuidanceOnly,
	); err != nil {
		return domain.StudentAppAITutorResultArchiveSnapshot{}, err
	}
	if err := json.Unmarshal(sections, &snapshot.GuidanceSections); err != nil {
		return domain.StudentAppAITutorResultArchiveSnapshot{}, err
	}
	if err := json.Unmarshal(labels, &snapshot.SafetyLabels); err != nil {
		return domain.StudentAppAITutorResultArchiveSnapshot{}, err
	}
	return domain.NormalizeStudentAppAITutorResultArchiveSnapshot(snapshot)
}
