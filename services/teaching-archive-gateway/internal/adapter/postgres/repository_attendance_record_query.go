package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) ListAttendanceRecords(
	ctx context.Context,
	query domain.AttendanceRecordQuery,
) ([]domain.AttendanceRecord, error) {
	args := make([]any, 0, 6)
	clauses := []string{"session_id = " + nextArg(&args, query.SessionID)}

	if query.StudentID != "" {
		clauses = append(clauses, "student_id = "+nextArg(&args, query.StudentID))
	}
	if len(query.StudentIDs) > 0 {
		clauses = append(clauses, "student_id = ANY("+nextArg(&args, query.StudentIDs)+")")
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

func scanAttendanceRecord(rows Rows) (domain.AttendanceRecord, error) {
	var (
		record   domain.AttendanceRecord
		status   string
		signTime sql.NullTime
		note     sql.NullString
	)
	if err := rows.Scan(
		&record.ID,
		&record.SessionID,
		&record.StudentID,
		&status,
		&record.RecordedByPrincipalID,
		&signTime,
		&note,
		&record.CreatedAt,
	); err != nil {
		return domain.AttendanceRecord{}, err
	}
	record.Status = domain.AttendanceRecordStatus(status)
	if signTime.Valid {
		record.SignTime = signTime.Time
	}
	if note.Valid {
		record.Note = note.String
	}
	return record, nil
}
