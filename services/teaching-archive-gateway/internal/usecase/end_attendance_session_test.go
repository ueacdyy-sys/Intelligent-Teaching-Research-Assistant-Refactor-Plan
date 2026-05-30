package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestEndAttendanceSessionEndsActiveSession(t *testing.T) {
	now := time.Date(2026, 5, 30, 12, 20, 0, 0, time.UTC)
	repo := &fakeEndAttendanceSessionRepository{
		sessions: map[string]domain.AttendanceSession{
			"att_sess_fixed": attendanceSession("att_sess_fixed", domain.AttendanceSessionStatusActive),
		},
	}
	uc := usecase.NewEndAttendanceSession(repo, fixedClock{now: now})

	session, err := uc.Execute(context.Background(), domain.EndAttendanceSessionInput{
		Principal: teacherPrincipal(),
		SessionID: " att_sess_fixed ",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if session.Status != domain.AttendanceSessionStatusEnded {
		t.Fatalf("Status = %q", session.Status)
	}
	if !session.EndedAt.Equal(now) {
		t.Fatalf("EndedAt = %s", session.EndedAt)
	}
	if repo.ends != 1 {
		t.Fatalf("ends = %d, want 1", repo.ends)
	}
}

func TestEndAttendanceSessionReturnsAlreadyEndedSession(t *testing.T) {
	endedAt := time.Date(2026, 5, 30, 12, 15, 0, 0, time.UTC)
	session := attendanceSession("att_sess_fixed", domain.AttendanceSessionStatusEnded)
	session.EndedAt = endedAt
	repo := &fakeEndAttendanceSessionRepository{
		sessions: map[string]domain.AttendanceSession{"att_sess_fixed": session},
	}
	uc := usecase.NewEndAttendanceSession(repo, fixedClock{now: endedAt.Add(5 * time.Minute)})

	ended, err := uc.Execute(context.Background(), domain.EndAttendanceSessionInput{
		Principal: adminPrincipal(),
		SessionID: "att_sess_fixed",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if !ended.EndedAt.Equal(endedAt) {
		t.Fatalf("EndedAt = %s", ended.EndedAt)
	}
}

func TestEndAttendanceSessionReturnsNotFoundForMissingSession(t *testing.T) {
	uc := usecase.NewEndAttendanceSession(&fakeEndAttendanceSessionRepository{}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.EndAttendanceSessionInput{
		Principal: teacherPrincipal(),
		SessionID: "att_sess_missing",
	})
	if !errors.Is(err, domain.ErrAttendanceSessionNotFound) {
		t.Fatalf("error = %v, want ErrAttendanceSessionNotFound", err)
	}
}

func TestEndAttendanceSessionRejectsUnauthorizedBeforeRepositoryAccess(t *testing.T) {
	repo := &fakeEndAttendanceSessionRepository{}
	uc := usecase.NewEndAttendanceSession(repo, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.EndAttendanceSessionInput{
		Principal: studentPrincipal("student_001"),
		SessionID: "att_sess_fixed",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.ends != 0 {
		t.Fatalf("ends = %d, want 0", repo.ends)
	}
}

type fakeEndAttendanceSessionRepository struct {
	sessions map[string]domain.AttendanceSession
	ends     int
}

func (f *fakeEndAttendanceSessionRepository) EndAttendanceSession(
	_ context.Context,
	id string,
	endedAt time.Time,
) (domain.AttendanceSession, bool, error) {
	f.ends++
	session, ok := f.sessions[id]
	if !ok {
		return domain.AttendanceSession{}, false, nil
	}
	if session.Status == domain.AttendanceSessionStatusActive {
		session.Status = domain.AttendanceSessionStatusEnded
		session.EndedAt = endedAt.UTC()
		f.sessions[id] = session
	}
	return session, true, nil
}
