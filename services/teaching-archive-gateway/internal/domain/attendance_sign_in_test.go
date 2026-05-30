package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNewAttendanceSignInRecordDerivesStudentAndNormalizesQR(t *testing.T) {
	now := time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC)

	record, err := domain.NewAttendanceSignInRecord(
		"att_rec_signin",
		activeAttendanceSession(),
		domain.AttendanceSignInInput{
			Principal:       studentPrincipal("student_001"),
			SessionID:       " att_sess_domain ",
			Method:          domain.AttendanceSignInMethod(" qr "),
			TimestampMillis: now.Add(-30 * time.Second).UnixMilli(),
			HasTimestamp:    true,
			Code:            " 123456 ",
		},
		now,
	)
	if err != nil {
		t.Fatalf("NewAttendanceSignInRecord returned error: %v", err)
	}

	if record.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", record.StudentID)
	}
	if record.Status != domain.AttendanceRecordStatusPresent {
		t.Fatalf("Status = %q", record.Status)
	}
	if record.RecordedByPrincipalID != "student_001" {
		t.Fatalf("RecordedByPrincipalID = %q", record.RecordedByPrincipalID)
	}
	if !record.SignTime.Equal(now) {
		t.Fatalf("SignTime = %s", record.SignTime)
	}
}

func TestNewAttendanceSignInRecordRejectsExpiredTimestamp(t *testing.T) {
	now := time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC)

	_, err := domain.NewAttendanceSignInRecord(
		"att_rec_signin",
		activeAttendanceSession(),
		domain.AttendanceSignInInput{
			Principal:       studentPrincipal("student_001"),
			SessionID:       "att_sess_domain",
			Method:          domain.AttendanceSignInMethodQR,
			TimestampMillis: now.Add(-61 * time.Second).UnixMilli(),
			HasTimestamp:    true,
		},
		now,
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestNewAttendanceSignInRecordRejectsMethodSessionMismatch(t *testing.T) {
	session := activeAttendanceSession()
	session.SessionType = domain.AttendanceSessionTypeGesture

	_, err := domain.NewAttendanceSignInRecord(
		"att_rec_signin",
		session,
		domain.AttendanceSignInInput{
			Principal: studentPrincipal("student_001"),
			SessionID: "att_sess_domain",
			Method:    domain.AttendanceSignInMethodQR,
		},
		time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestNewAttendanceSignInRecordRejectsEndedSession(t *testing.T) {
	session := activeAttendanceSession()
	session.Status = domain.AttendanceSessionStatusEnded

	_, err := domain.NewAttendanceSignInRecord(
		"att_rec_signin",
		session,
		domain.AttendanceSignInInput{
			Principal: studentPrincipal("student_001"),
			SessionID: "att_sess_domain",
			Method:    domain.AttendanceSignInMethodQR,
		},
		time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrAttendanceSessionNotActive) {
		t.Fatalf("error = %v, want ErrAttendanceSessionNotActive", err)
	}
}

func TestNormalizeAttendanceSignInInputRejectsTeacherPrincipal(t *testing.T) {
	_, err := domain.NormalizeAttendanceSignInInput(
		domain.AttendanceSignInInput{
			Principal: teacherPrincipal(),
			SessionID: "att_sess_domain",
			Method:    domain.AttendanceSignInMethodQR,
		},
		time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}
