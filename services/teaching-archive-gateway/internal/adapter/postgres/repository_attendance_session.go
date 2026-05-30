package postgres

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) CreateAttendanceSession(
	ctx context.Context,
	session domain.AttendanceSession,
) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO teaching_attendance_sessions (
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
		) VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, NULLIF($8, ''), $9, $10, $11, NULL)
	`,
		session.ID,
		session.SessionType,
		session.ClassName,
		session.ExpectedStudentCount,
		session.PresentCount,
		session.AbsentCount,
		session.LateCount,
		session.ConfigRef,
		session.Status,
		session.CreatedByPrincipalID,
		session.CreatedAt,
	)
	return err
}
