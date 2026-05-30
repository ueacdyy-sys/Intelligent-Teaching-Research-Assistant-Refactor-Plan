package postgres

import (
	"context"
	"database/sql"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) GetAttendanceSessionByID(
	ctx context.Context,
	id string,
) (domain.AttendanceSession, bool, error) {
	rows, err := r.db.Query(ctx, `
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
	`, id)
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

func (r *ArchiveRepository) CreateAttendanceRecord(
	ctx context.Context,
	record domain.AttendanceRecord,
) (domain.AttendanceRecord, bool, error) {
	rows, err := r.db.Query(ctx, `
		WITH active_session AS (
			SELECT id
			FROM teaching_attendance_sessions AS session
			WHERE session.id = $2
				AND session.status = 'ACTIVE'
			FOR UPDATE
		),
		inserted AS (
			INSERT INTO teaching_attendance_records (
				id,
				session_id,
				student_id,
				status,
				recorded_by_principal_id,
				sign_time,
				note,
				created_at
			)
			SELECT $1, $2, $3, $4, $5, $6, NULLIF($7, ''), $8
			FROM active_session
			ON CONFLICT (session_id, student_id) DO NOTHING
			RETURNING
				id,
				session_id,
				student_id,
				status,
				recorded_by_principal_id,
				sign_time,
				note,
				created_at
		),
		updated AS (
			UPDATE teaching_attendance_sessions
			SET
				present_count = present_count + CASE WHEN $4 = 'PRESENT' THEN 1 ELSE 0 END,
				absent_count = absent_count + CASE WHEN $4 = 'ABSENT' THEN 1 ELSE 0 END,
				late_count = late_count + CASE WHEN $4 = 'LATE' THEN 1 ELSE 0 END
			WHERE id = $2
				AND status = 'ACTIVE'
				AND EXISTS (SELECT 1 FROM inserted)
			RETURNING id
		)
		SELECT
			id,
			session_id,
			student_id,
			status,
			recorded_by_principal_id,
			sign_time,
			note,
			created_at,
			TRUE AS created
		FROM inserted
		UNION ALL
		SELECT
			existing.id,
			existing.session_id,
			existing.student_id,
			existing.status,
			existing.recorded_by_principal_id,
			existing.sign_time,
			existing.note,
			existing.created_at,
			FALSE AS created
		FROM teaching_attendance_records AS existing
		WHERE existing.session_id = $2
			AND existing.student_id = $3
			AND EXISTS (SELECT 1 FROM active_session)
			AND NOT EXISTS (SELECT 1 FROM inserted)
	`,
		record.ID,
		record.SessionID,
		record.StudentID,
		record.Status,
		record.RecordedByPrincipalID,
		nullTime(record.SignTime),
		record.Note,
		record.CreatedAt,
	)
	if err != nil {
		return domain.AttendanceRecord{}, false, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return domain.AttendanceRecord{}, false, err
		}
		return domain.AttendanceRecord{}, false, domain.ErrAttendanceSessionNotActive
	}
	persisted, created, err := scanAttendanceRecordWithCreated(rows)
	if err != nil {
		return domain.AttendanceRecord{}, false, err
	}
	if err := rows.Err(); err != nil {
		return domain.AttendanceRecord{}, false, err
	}
	return persisted, created, nil
}

func scanAttendanceSession(rows Rows) (domain.AttendanceSession, error) {
	var (
		session     domain.AttendanceSession
		sessionType string
		className   sql.NullString
		configRef   sql.NullString
		status      string
		endedAt     sql.NullTime
	)
	if err := rows.Scan(
		&session.ID,
		&sessionType,
		&className,
		&session.ExpectedStudentCount,
		&session.PresentCount,
		&session.AbsentCount,
		&session.LateCount,
		&configRef,
		&status,
		&session.CreatedByPrincipalID,
		&session.CreatedAt,
		&endedAt,
	); err != nil {
		return domain.AttendanceSession{}, err
	}
	session.SessionType = domain.AttendanceSessionType(sessionType)
	if className.Valid {
		session.ClassName = className.String
	}
	if configRef.Valid {
		session.ConfigRef = configRef.String
	}
	session.Status = domain.AttendanceSessionStatus(status)
	if endedAt.Valid {
		session.EndedAt = endedAt.Time
	}
	return session, nil
}

func scanAttendanceRecordWithCreated(rows Rows) (domain.AttendanceRecord, bool, error) {
	var (
		record   domain.AttendanceRecord
		status   string
		signTime sql.NullTime
		note     sql.NullString
		created  bool
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
		&created,
	); err != nil {
		return domain.AttendanceRecord{}, false, err
	}
	record.Status = domain.AttendanceRecordStatus(status)
	if signTime.Valid {
		record.SignTime = signTime.Time
	}
	if note.Valid {
		record.Note = note.String
	}
	return record, created, nil
}
