package postgres

import (
	"context"
	"fmt"
	"strings"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) ListStudentAttendanceRecords(
	ctx context.Context,
	query domain.StudentAttendanceRecordQuery,
) ([]domain.AttendanceRecord, error) {
	args := make([]any, 0, 4)
	clauses := []string{"student_id = " + nextArg(&args, query.StudentID)}

	if query.Cursor != nil {
		createdAtArg := nextArg(&args, query.Cursor.CreatedAt)
		idArg := nextArg(&args, query.Cursor.ID)
		clauses = append(clauses, fmt.Sprintf("(created_at, id) < (%s, %s)", createdAtArg, idArg))
	}
	limitArg := nextArg(&args, query.FetchLimit)

	rows, err := r.db.Query(ctx, `
		SELECT
			id,
			session_id,
			student_id,
			status,
			recorded_by_principal_id,
			sign_time,
			note,
			created_at
		FROM teaching_attendance_records
		WHERE `+strings.Join(clauses, " AND ")+`
		ORDER BY created_at DESC, id DESC
		LIMIT `+limitArg,
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := make([]domain.AttendanceRecord, 0, query.FetchLimit)
	for rows.Next() {
		record, err := scanAttendanceRecord(rows)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}
