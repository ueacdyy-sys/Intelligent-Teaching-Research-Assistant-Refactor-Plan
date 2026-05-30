package postgres_test

import (
	"context"
	"strings"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestListAttendancePresentStudentIDsBuildsScopedQuery(t *testing.T) {
	db := &recordingDB{rows: &studentIDRows{values: []string{"student_001", "student_002"}}}
	repository := postgres.NewArchiveRepository(db)

	studentIDs, err := repository.ListAttendancePresentStudentIDs(context.Background(), "att_sess_row")
	if err != nil {
		t.Fatalf("ListAttendancePresentStudentIDs returned error: %v", err)
	}
	if strings.Join(studentIDs, ",") != "student_001,student_002" {
		t.Fatalf("studentIDs = %#v", studentIDs)
	}

	for _, fragment := range []string{
		"SELECT student_id",
		"FROM teaching_attendance_records",
		"WHERE session_id = $1",
		"status = $2",
		"ORDER BY student_id ASC",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if strings.Contains(db.lastSQL, "UPDATE") || strings.Contains(db.lastSQL, "INSERT") {
		t.Fatalf("SQL should be read-only: %s", db.lastSQL)
	}
	if len(db.args) != 2 || db.args[1] != string(domain.AttendanceRecordStatusPresent) {
		t.Fatalf("args = %#v, want session id and PRESENT status", db.args)
	}
}

type studentIDRows struct {
	values []string
	index  int
}

func (r *studentIDRows) Close() {}

func (r *studentIDRows) Next() bool {
	return r.index < len(r.values)
}

func (r *studentIDRows) Scan(dest ...any) error {
	*(dest[0].(*string)) = r.values[r.index]
	r.index++
	return nil
}

func (r *studentIDRows) Err() error {
	return nil
}
