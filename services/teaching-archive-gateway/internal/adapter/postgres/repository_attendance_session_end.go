package postgres

import (
	"context"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) EndAttendanceSession(
	ctx context.Context,
	id string,
	endedAt time.Time,
) (domain.AttendanceSession, bool, error) {
	rows, err := r.db.Query(ctx, `
		WITH ended AS (
			UPDATE teaching_attendance_sessions
			SET status = 'ENDED',
				ended_at = $2
			WHERE id = $1
				AND status = 'ACTIVE'
			RETURNING
				id,
				session_type,
				class_name,
				expected_student_count,
				present_count,
				absent_count,
				late_count,
				config_ref,
				status,
				created_by_principal_id,
				created_at,
				ended_at
		)
		SELECT
			id,
			session_type,
			class_name,
			expected_student_count,
			present_count,
			absent_count,
			late_count,
			config_ref,
			status,
			created_by_principal_id,
			created_at,
			ended_at
		FROM ended
		UNION ALL
		SELECT
			id,
			session_type,
			class_name,
			expected_student_count,
			present_count,
			absent_count,
			late_count,
			config_ref,
			status,
			created_by_principal_id,
			created_at,
			ended_at
		FROM teaching_attendance_sessions
		WHERE id = $1
			AND status = 'ENDED'
			AND NOT EXISTS (SELECT 1 FROM ended)
	`, id, endedAt.UTC())
	if err != nil {
		return domain.AttendanceSession{}, false, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return domain.AttendanceSession{}, false, err
		}
		return domain.AttendanceSession{}, false, nil
	}
	session, err := scanAttendanceSession(rows)
	if err != nil {
		return domain.AttendanceSession{}, false, err
	}
	if err := rows.Err(); err != nil {
		return domain.AttendanceSession{}, false, err
	}
	return session, true, nil
}
