package usecase_test

import (
	"context"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestCreateAttendanceSessionPersistsZeroedSession(t *testing.T) {
	repo := &fakeAttendanceSessionRepository{}
	uc := usecase.NewCreateAttendanceSession(
		repo,
		fixedIDs{id: "att_sess_fixed"},
		fixedClock{now: time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)},
	)

	session, err := uc.Execute(context.Background(), domain.CreateAttendanceSessionInput{
		Principal:            teacherPrincipalWithStudents("student_001"),
		SessionType:          domain.AttendanceSessionTypeQRCode,
		ClassName:            "Class A",
		ExpectedStudentCount: 42,
		ConfigRef:            "local://attendance/qrcode/class-a.json",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if session.ID != "att_sess_fixed" {
		t.Fatalf("ID = %q", session.ID)
	}
	if session.PresentCount != 0 || session.AbsentCount != 0 || session.LateCount != 0 {
		t.Fatalf("counts = %d/%d/%d", session.PresentCount, session.AbsentCount, session.LateCount)
	}
	if repo.creates != 1 {
		t.Fatalf("creates = %d", repo.creates)
	}
	if repo.created.ConfigRef != "local://attendance/qrcode/class-a.json" {
		t.Fatalf("created ConfigRef = %q", repo.created.ConfigRef)
	}
}

type fakeAttendanceSessionRepository struct {
	created domain.AttendanceSession
	creates int
}

func (f *fakeAttendanceSessionRepository) CreateAttendanceSession(
	_ context.Context,
	session domain.AttendanceSession,
) error {
	f.created = session
	f.creates++
	return nil
}
