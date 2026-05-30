package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNewAttendanceSessionNormalizesMetadata(t *testing.T) {
	createdAt := time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)

	session, err := domain.NewAttendanceSession(
		"att_sess_fixed",
		domain.CreateAttendanceSessionInput{
			Principal:            teacherPrincipal(),
			SessionType:          domain.AttendanceSessionType(" qrcode "),
			ClassName:            " Class A ",
			ExpectedStudentCount: 42,
			ConfigRef:            " local://attendance/qrcode/class-a.json ",
		},
		createdAt,
	)
	if err != nil {
		t.Fatalf("NewAttendanceSession returned error: %v", err)
	}

	if session.ID != "att_sess_fixed" {
		t.Fatalf("ID = %q", session.ID)
	}
	if session.SessionType != domain.AttendanceSessionTypeQRCode {
		t.Fatalf("SessionType = %q", session.SessionType)
	}
	if session.ClassName != "Class A" {
		t.Fatalf("ClassName = %q", session.ClassName)
	}
	if session.ExpectedStudentCount != 42 {
		t.Fatalf("ExpectedStudentCount = %d", session.ExpectedStudentCount)
	}
	if session.ConfigRef != "local://attendance/qrcode/class-a.json" {
		t.Fatalf("ConfigRef = %q", session.ConfigRef)
	}
	if session.PresentCount != 0 || session.AbsentCount != 0 || session.LateCount != 0 {
		t.Fatalf("counts = %d/%d/%d", session.PresentCount, session.AbsentCount, session.LateCount)
	}
	if session.CreatedByPrincipalID != "teacher_001" {
		t.Fatalf("CreatedByPrincipalID = %q", session.CreatedByPrincipalID)
	}
	if session.Status != domain.AttendanceSessionStatusActive {
		t.Fatalf("Status = %q", session.Status)
	}
	if !session.CreatedAt.Equal(createdAt) {
		t.Fatalf("CreatedAt = %s", session.CreatedAt)
	}
}

func TestNewAttendanceSessionRejectsUnsupportedType(t *testing.T) {
	_, err := domain.NewAttendanceSession(
		"att_sess_fixed",
		domain.CreateAttendanceSessionInput{
			Principal:   teacherPrincipal(),
			SessionType: domain.AttendanceSessionType("VOICE"),
		},
		time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestAuthorizeCreateAttendanceSessionRejectsStudent(t *testing.T) {
	err := domain.AuthorizeCreateAttendanceSession(studentPrincipal("student_001"))
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}
