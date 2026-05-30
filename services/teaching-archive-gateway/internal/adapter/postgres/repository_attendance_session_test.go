package postgres_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestCreateAttendanceSessionInsertsMetadataOnly(t *testing.T) {
	db := &recordingDB{tag: commandTag{rowsAffected: 1}}
	repository := postgres.NewArchiveRepository(db)

	err := repository.CreateAttendanceSession(context.Background(), domain.AttendanceSession{
		ID:                   "att_sess_row",
		SessionType:          domain.AttendanceSessionTypeQRCode,
		ClassName:            "Class A",
		ExpectedStudentCount: 42,
		PresentCount:         0,
		AbsentCount:          0,
		LateCount:            0,
		ConfigRef:            "local://attendance/qrcode/class-a.json",
		Status:               domain.AttendanceSessionStatusActive,
		CreatedByPrincipalID: "teacher_001",
		CreatedAt:            time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("CreateAttendanceSession returned error: %v", err)
	}

	for _, fragment := range []string{
		"INSERT INTO teaching_attendance_sessions",
		"session_type",
		"expected_student_count",
		"present_count",
		"absent_count",
		"late_count",
		"created_by_principal_id",
		"VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, NULLIF($8, ''), $9, $10, $11, NULL)",
	} {
		if !strings.Contains(db.lastExecSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastExecSQL)
		}
	}
	if len(db.execArgs) != 11 {
		t.Fatalf("args = %d, want 11", len(db.execArgs))
	}
}
