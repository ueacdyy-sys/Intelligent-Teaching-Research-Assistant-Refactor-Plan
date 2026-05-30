package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestSignInAttendanceCreatesPresentRecord(t *testing.T) {
	now := time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC)
	repo := &fakeAttendanceRecordRepository{
		sessions: map[string]domain.AttendanceSession{
			"att_sess_fixed": attendanceSession("att_sess_fixed", domain.AttendanceSessionStatusActive),
		},
	}
	uc := usecase.NewSignInAttendance(repo, fixedIDs{id: "att_rec_signin"}, fixedClock{now: now})

	result, err := uc.Execute(context.Background(), domain.AttendanceSignInInput{
		Principal:       studentPrincipal("student_001"),
		SessionID:       "att_sess_fixed",
		Method:          domain.AttendanceSignInMethodQR,
		TimestampMillis: now.UnixMilli(),
		HasTimestamp:    true,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if !result.Created {
		t.Fatal("Created = false, want true")
	}
	if result.Record.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", result.Record.StudentID)
	}
	if result.Record.Status != domain.AttendanceRecordStatusPresent {
		t.Fatalf("Status = %q", result.Record.Status)
	}
	if repo.gets != 1 || repo.creates != 1 {
		t.Fatalf("repo gets=%d creates=%d, want 1/1", repo.gets, repo.creates)
	}
}

func TestSignInAttendanceReturnsExistingDuplicate(t *testing.T) {
	existing := domain.AttendanceRecord{
		ID:                    "att_rec_existing",
		SessionID:             "att_sess_fixed",
		StudentID:             "student_001",
		Status:                domain.AttendanceRecordStatusPresent,
		RecordedByPrincipalID: "student_001",
		CreatedAt:             time.Date(2026, 5, 30, 12, 1, 0, 0, time.UTC),
	}
	repo := &fakeAttendanceRecordRepository{
		sessions: map[string]domain.AttendanceSession{
			"att_sess_fixed": attendanceSession("att_sess_fixed", domain.AttendanceSessionStatusActive),
		},
		existing: &existing,
	}
	uc := usecase.NewSignInAttendance(repo, fixedIDs{id: "att_rec_new"}, fixedClock{})

	result, err := uc.Execute(context.Background(), domain.AttendanceSignInInput{
		Principal: studentPrincipal("student_001"),
		SessionID: "att_sess_fixed",
		Method:    domain.AttendanceSignInMethodQR,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if result.Created {
		t.Fatal("Created = true, want duplicate existing result")
	}
	if result.Record.ID != "att_rec_existing" {
		t.Fatalf("Record.ID = %q", result.Record.ID)
	}
}

func TestSignInAttendanceRejectsUnauthorizedBeforeRepositoryAccess(t *testing.T) {
	repo := &fakeAttendanceRecordRepository{}
	uc := usecase.NewSignInAttendance(repo, fixedIDs{id: "att_rec_signin"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.AttendanceSignInInput{
		Principal: teacherPrincipal(),
		SessionID: "att_sess_fixed",
		Method:    domain.AttendanceSignInMethodQR,
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.gets != 0 || repo.creates != 0 {
		t.Fatalf("repo gets=%d creates=%d, want 0/0", repo.gets, repo.creates)
	}
}
