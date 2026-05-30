package postgres_test

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestListAttendanceRecordsBuildsScopedIndexedQuery(t *testing.T) {
	db := &recordingDB{rows: &attendanceRecordRows{}}
	repository := postgres.NewArchiveRepository(db)

	records, err := repository.ListAttendanceRecords(context.Background(), domain.AttendanceRecordQuery{
		SessionID:  "att_sess_row",
		StudentID:  "student_001",
		FetchLimit: 3,
		Cursor: &domain.AttendanceRecordCursor{
			CreatedAt: time.Date(2026, 5, 30, 12, 3, 0, 0, time.UTC),
			ID:        "att_rec_cursor",
		},
	})
	if err != nil {
		t.Fatalf("ListAttendanceRecords returned error: %v", err)
	}

	for _, fragment := range []string{
		"FROM teaching_attendance_records",
		"session_id = $1",
		"student_id = $2",
		"(created_at, id) < ($3, $4)",
		"ORDER BY created_at DESC, id DESC",
		"LIMIT $5",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 5 {
		t.Fatalf("args = %d, want 5", len(db.args))
	}
	if len(records) != 1 || records[0].ID != "att_rec_row" {
		t.Fatalf("records = %#v", records)
	}
}

func TestListAttendanceRecordsSupportsAssignedStudentIDs(t *testing.T) {
	db := &recordingDB{rows: &emptyRows{}}
	repository := postgres.NewArchiveRepository(db)

	_, err := repository.ListAttendanceRecords(context.Background(), domain.AttendanceRecordQuery{
		SessionID:  "att_sess_row",
		StudentIDs: []string{"student_001", "student_002"},
		FetchLimit: 3,
	})
	if err != nil {
		t.Fatalf("ListAttendanceRecords returned error: %v", err)
	}

	for _, fragment := range []string{
		"session_id = $1",
		"student_id = ANY($2)",
		"LIMIT $3",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 3 {
		t.Fatalf("args = %d, want 3", len(db.args))
	}
}

type attendanceRecordRows struct {
	advanced bool
}

func (r *attendanceRecordRows) Close() {}

func (r *attendanceRecordRows) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *attendanceRecordRows) Scan(dest ...any) error {
	*(dest[0].(*string)) = "att_rec_row"
	*(dest[1].(*string)) = "att_sess_row"
	*(dest[2].(*string)) = "student_001"
	*(dest[3].(*string)) = string(domain.AttendanceRecordStatusPresent)
	*(dest[4].(*string)) = "teacher_001"
	*(dest[5].(*sql.NullTime)) = sql.NullTime{Time: time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC), Valid: true}
	*(dest[6].(*sql.NullString)) = sql.NullString{String: "QR scan", Valid: true}
	*(dest[7].(*time.Time)) = time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC)
	return nil
}

func (r *attendanceRecordRows) Err() error {
	return nil
}
