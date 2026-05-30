package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestCreateAttendanceRecordLoadsSessionAndPersistsRecord(t *testing.T) {
	repo := &fakeAttendanceRecordRepository{
		sessions: map[string]domain.AttendanceSession{
			"att_sess_fixed": attendanceSession("att_sess_fixed", domain.AttendanceSessionStatusActive),
		},
	}
	uc := usecase.NewCreateAttendanceRecord(
		repo,
		fixedIDs{id: "att_rec_fixed"},
		fixedClock{now: time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC)},
	)

	result, err := uc.Execute(context.Background(), domain.CreateAttendanceRecordInput{
		Principal: teacherPrincipalWithStudents("student_001"),
		SessionID: "att_sess_fixed",
		StudentID: "student_001",
		Status:    domain.AttendanceRecordStatusPresent,
		Note:      "QR scan",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if !result.Created {
		t.Fatal("Created = false, want true")
	}
	if result.Record.ID != "att_rec_fixed" {
		t.Fatalf("Record.ID = %q", result.Record.ID)
	}
	if repo.gets != 1 {
		t.Fatalf("gets = %d", repo.gets)
	}
	if repo.creates != 1 {
		t.Fatalf("creates = %d", repo.creates)
	}
	if repo.created.SignTime.IsZero() {
		t.Fatal("created SignTime is zero")
	}
}

func TestCreateAttendanceRecordReturnsExistingDuplicate(t *testing.T) {
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
	uc := usecase.NewCreateAttendanceRecord(repo, fixedIDs{id: "att_rec_new"}, fixedClock{})

	result, err := uc.Execute(context.Background(), domain.CreateAttendanceRecordInput{
		Principal: studentPrincipal("student_001"),
		SessionID: "att_sess_fixed",
		StudentID: "student_001",
		Status:    domain.AttendanceRecordStatusPresent,
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

func TestCreateAttendanceRecordReturnsNotFoundForMissingSession(t *testing.T) {
	uc := usecase.NewCreateAttendanceRecord(&fakeAttendanceRecordRepository{}, fixedIDs{id: "att_rec_fixed"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateAttendanceRecordInput{
		Principal: teacherPrincipalWithStudents("student_001"),
		SessionID: "att_sess_missing",
		StudentID: "student_001",
		Status:    domain.AttendanceRecordStatusPresent,
	})
	if !errors.Is(err, domain.ErrAttendanceSessionNotFound) {
		t.Fatalf("error = %v, want ErrAttendanceSessionNotFound", err)
	}
}

func TestCreateAttendanceRecordRejectsEndedSessionBeforePersist(t *testing.T) {
	repo := &fakeAttendanceRecordRepository{
		sessions: map[string]domain.AttendanceSession{
			"att_sess_fixed": attendanceSession("att_sess_fixed", domain.AttendanceSessionStatusEnded),
		},
	}
	uc := usecase.NewCreateAttendanceRecord(repo, fixedIDs{id: "att_rec_fixed"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateAttendanceRecordInput{
		Principal: teacherPrincipalWithStudents("student_001"),
		SessionID: "att_sess_fixed",
		StudentID: "student_001",
		Status:    domain.AttendanceRecordStatusPresent,
	})
	if !errors.Is(err, domain.ErrAttendanceSessionNotActive) {
		t.Fatalf("error = %v, want ErrAttendanceSessionNotActive", err)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d, want 0", repo.creates)
	}
}

type fakeAttendanceRecordRepository struct {
	sessions map[string]domain.AttendanceSession
	existing *domain.AttendanceRecord
	created  domain.AttendanceRecord
	gets     int
	creates  int
}

func (f *fakeAttendanceRecordRepository) GetAttendanceSessionByID(
	_ context.Context,
	id string,
) (domain.AttendanceSession, bool, error) {
	f.gets++
	session, ok := f.sessions[id]
	return session, ok, nil
}

func (f *fakeAttendanceRecordRepository) CreateAttendanceRecord(
	_ context.Context,
	record domain.AttendanceRecord,
) (domain.AttendanceRecord, bool, error) {
	f.creates++
	f.created = record
	if f.existing != nil {
		return *f.existing, false, nil
	}
	return record, true, nil
}

func attendanceSession(id string, status domain.AttendanceSessionStatus) domain.AttendanceSession {
	return domain.AttendanceSession{
		ID:                   id,
		SessionType:          domain.AttendanceSessionTypeQRCode,
		ExpectedStudentCount: 42,
		Status:               status,
		CreatedByPrincipalID: "teacher_001",
		CreatedAt:            time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC),
	}
}
