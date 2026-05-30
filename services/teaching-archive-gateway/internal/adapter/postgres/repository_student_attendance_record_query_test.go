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

func TestListStudentAttendanceRecordsBuildsIndexedQuery(t *testing.T) {
	db := &recordingDB{rows: &studentAttendanceRecordRows{}}
	repository := postgres.NewArchiveRepository(db)

	records, err := repository.ListStudentAttendanceRecords(context.Background(), domain.StudentAttendanceRecordQuery{
		StudentID:  "student_001",
		FetchLimit: 3,
		Cursor: &domain.AttendanceRecordCursor{
			CreatedAt: time.Date(2026, 5, 30, 12, 3, 0, 0, time.UTC),
			ID:        "att_rec_cursor",
		},
	})
	if err != nil {
		t.Fatalf("ListStudentAttendanceRecords returned error: %v", err)
	}

	for _, fragment := range []string{
		"FROM teaching_attendance_records",
		"student_id = $1",
		"(created_at, id) < ($2, $3)",
		"ORDER BY created_at DESC, id DESC",
		"LIMIT $4",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 4 {
		t.Fatalf("args = %d, want 4", len(db.args))
	}
	if len(records) != 1 || records[0].ID != "att_rec_student_row" {
		t.Fatalf("records = %#v", records)
	}
}

type studentAttendanceRecordRows struct {
	advanced bool
}

func (r *studentAttendanceRecordRows) Close() {}

func (r *studentAttendanceRecordRows) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *studentAttendanceRecordRows) Scan(dest ...any) error {
	*(dest[0].(*string)) = "att_rec_student_row"
	*(dest[1].(*string)) = "att_sess_row"
	*(dest[2].(*string)) = "student_001"
	*(dest[3].(*string)) = string(domain.AttendanceRecordStatusPresent)
	*(dest[4].(*string)) = "teacher_001"
	*(dest[5].(*sql.NullTime)) = sql.NullTime{Time: time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC), Valid: true}
	*(dest[6].(*sql.NullString)) = sql.NullString{String: "QR scan", Valid: true}
	*(dest[7].(*time.Time)) = time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC)
	return nil
}

func (r *studentAttendanceRecordRows) Err() error {
	return nil
}
