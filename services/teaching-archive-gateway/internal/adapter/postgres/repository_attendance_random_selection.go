package postgres

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) ListAttendancePresentStudentIDs(
	ctx context.Context,
	sessionID string,
) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT student_id
		FROM teaching_attendance_records
		WHERE session_id = $1
			AND status = $2
		ORDER BY student_id ASC
	`, sessionID, string(domain.AttendanceRecordStatusPresent))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	studentIDs := make([]string, 0)
	for rows.Next() {
		var studentID string
		if err := rows.Scan(&studentID); err != nil {
			return nil, err
		}
		studentIDs = append(studentIDs, studentID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return studentIDs, nil
}

var _ interface {
	ListAttendancePresentStudentIDs(context.Context, string) ([]string, error)
} = (*ArchiveRepository)(nil)
