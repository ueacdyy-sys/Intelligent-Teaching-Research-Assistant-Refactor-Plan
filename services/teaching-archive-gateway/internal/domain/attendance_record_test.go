package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNewAttendanceRecordNormalizesPresentRecord(t *testing.T) {
	now := time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC)

	record, err := domain.NewAttendanceRecord(
		"att_rec_fixed",
		activeAttendanceSession(),
		domain.CreateAttendanceRecordInput{
			Principal: teacherPrincipal(),
			StudentID: " student_001 ",
			Status:    domain.AttendanceRecordStatus(" present "),
			Note:      " Arrived through QR ",
		},
		now,
	)
	if err != nil {
		t.Fatalf("NewAttendanceRecord returned error: %v", err)
	}

	if record.ID != "att_rec_fixed" {
		t.Fatalf("ID = %q", record.ID)
	}
	if record.SessionID != "att_sess_domain" {
		t.Fatalf("SessionID = %q", record.SessionID)
	}
	if record.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", record.StudentID)
	}
	if record.Status != domain.AttendanceRecordStatusPresent {
		t.Fatalf("Status = %q", record.Status)
	}
	if record.RecordedByPrincipalID != "teacher_001" {
		t.Fatalf("RecordedByPrincipalID = %q", record.RecordedByPrincipalID)
	}
	if !record.SignTime.Equal(now) {
		t.Fatalf("SignTime = %s", record.SignTime)
	}
	if record.Note != "Arrived through QR" {
		t.Fatalf("Note = %q", record.Note)
	}
	if !record.CreatedAt.Equal(now) {
		t.Fatalf("CreatedAt = %s", record.CreatedAt)
	}
}

func TestNewAttendanceRecordLeavesSignTimeEmptyForAbsentAndLeave(t *testing.T) {
	for _, status := range []domain.AttendanceRecordStatus{
		domain.AttendanceRecordStatusAbsent,
		domain.AttendanceRecordStatusLeave,
	} {
		record, err := domain.NewAttendanceRecord(
			"att_rec_fixed",
			activeAttendanceSession(),
			domain.CreateAttendanceRecordInput{
				Principal: teacherPrincipal(),
				StudentID: "student_001",
				Status:    status,
			},
			time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC),
		)
		if err != nil {
			t.Fatalf("NewAttendanceRecord(%s) returned error: %v", status, err)
		}
		if !record.SignTime.IsZero() {
			t.Fatalf("SignTime for %s = %s", status, record.SignTime)
		}
	}
}

func TestNewAttendanceRecordRejectsUnsupportedStatus(t *testing.T) {
	_, err := domain.NewAttendanceRecord(
		"att_rec_fixed",
		activeAttendanceSession(),
		domain.CreateAttendanceRecordInput{
			Principal: teacherPrincipal(),
			StudentID: "student_001",
			Status:    domain.AttendanceRecordStatus("UNKNOWN"),
		},
		time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestNewAttendanceRecordRejectsEndedSession(t *testing.T) {
	session := activeAttendanceSession()
	session.Status = domain.AttendanceSessionStatusEnded

	_, err := domain.NewAttendanceRecord(
		"att_rec_fixed",
		session,
		domain.CreateAttendanceRecordInput{
			Principal: teacherPrincipal(),
			StudentID: "student_001",
			Status:    domain.AttendanceRecordStatusPresent,
		},
		time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrAttendanceSessionNotActive) {
		t.Fatalf("error = %v, want ErrAttendanceSessionNotActive", err)
	}
}

func TestNewAttendanceRecordRejectsCrossStudentOwnWrite(t *testing.T) {
	_, err := domain.NewAttendanceRecord(
		"att_rec_fixed",
		activeAttendanceSession(),
		domain.CreateAttendanceRecordInput{
			Principal: studentPrincipal("student_001"),
			StudentID: "student_002",
			Status:    domain.AttendanceRecordStatusPresent,
		},
		time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestNewAttendanceRecordRequiresPrefixedID(t *testing.T) {
	_, err := domain.NewAttendanceRecord(
		"record_bad",
		activeAttendanceSession(),
		domain.CreateAttendanceRecordInput{
			Principal: teacherPrincipal(),
			StudentID: "student_001",
			Status:    domain.AttendanceRecordStatusPresent,
		},
		time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC),
	)
	if err == nil {
		t.Fatal("expected generated id prefix validation error")
	}
}

func activeAttendanceSession() domain.AttendanceSession {
	return domain.AttendanceSession{
		ID:                   "att_sess_domain",
		SessionType:          domain.AttendanceSessionTypeQRCode,
		ExpectedStudentCount: 42,
		Status:               domain.AttendanceSessionStatusActive,
		CreatedByPrincipalID: "teacher_001",
		CreatedAt:            time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC),
	}
}
