package postgres

import (
	"context"
	"strings"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) GetAttendanceStatistics(
	ctx context.Context,
	query domain.AttendanceStatisticsQuery,
) (domain.AttendanceStatistics, error) {
	args := make([]any, 0, 1)
	clauses := make([]string, 0, 1)
	if query.ClassName != "" {
		clauses = append(clauses, "class_name = "+nextArg(&args, query.ClassName))
	}

	whereClause := ""
	if len(clauses) > 0 {
		whereClause = "WHERE " + strings.Join(clauses, " AND ")
	}

	rows, err := r.db.Query(ctx, `
		SELECT
			COALESCE(MAX(expected_student_count), 0),
			COALESCE(SUM(present_count), 0),
			COALESCE(SUM(absent_count), 0),
			COALESCE(SUM(late_count), 0)
		FROM teaching_attendance_sessions
		`+whereClause,
		args...,
	)
	if err != nil {
		return domain.AttendanceStatistics{}, err
	}
	defer rows.Close()

	var totalStudents, attendanceCount, absenceCount, lateCount int64
	if rows.Next() {
		if err := rows.Scan(&totalStudents, &attendanceCount, &absenceCount, &lateCount); err != nil {
			return domain.AttendanceStatistics{}, err
		}
	}
	if err := rows.Err(); err != nil {
		return domain.AttendanceStatistics{}, err
	}
	return domain.BuildAttendanceStatistics(
		int(totalStudents),
		int(attendanceCount),
		int(absenceCount),
		int(lateCount),
	)
}
