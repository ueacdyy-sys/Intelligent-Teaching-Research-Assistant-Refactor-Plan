package postgres_test

import (
	"context"
	"strings"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestGetAttendanceStatisticsBuildsSessionCounterAggregate(t *testing.T) {
	db := &recordingDB{rows: &attendanceStatisticsRows{}}
	repository := postgres.NewArchiveRepository(db)

	stats, err := repository.GetAttendanceStatistics(context.Background(), domain.AttendanceStatisticsQuery{
		ClassName: "Class A",
	})
	if err != nil {
		t.Fatalf("GetAttendanceStatistics returned error: %v", err)
	}

	for _, fragment := range []string{
		"FROM teaching_attendance_sessions",
		"MAX(expected_student_count)",
		"SUM(present_count)",
		"SUM(absent_count)",
		"SUM(late_count)",
		"class_name = $1",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if strings.Contains(db.lastSQL, "teaching_attendance_records") {
		t.Fatalf("statistics query must not scan attendance records: %s", db.lastSQL)
	}
	if len(db.args) != 1 || db.args[0] != "Class A" {
		t.Fatalf("args = %#v", db.args)
	}
	if stats.TotalStudents != 42 || stats.TotalRecords != 10 || stats.AttendanceRate != 0.8 {
		t.Fatalf("stats = %#v", stats)
	}
}

type attendanceStatisticsRows struct {
	advanced bool
}

func (r *attendanceStatisticsRows) Close() {}

func (r *attendanceStatisticsRows) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *attendanceStatisticsRows) Scan(dest ...any) error {
	*(dest[0].(*int64)) = 42
	*(dest[1].(*int64)) = 8
	*(dest[2].(*int64)) = 1
	*(dest[3].(*int64)) = 1
	return nil
}

func (r *attendanceStatisticsRows) Err() error {
	return nil
}
