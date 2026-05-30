package usecase_test

import (
	"context"
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestSelectAttendanceRandomStudentsLoadsSessionAndPresentIDs(t *testing.T) {
	repo := &fakeAttendanceRandomSelectionRepository{
		sessions: map[string]domain.AttendanceSession{
			"att_sess_fixed": attendanceSession("att_sess_fixed", domain.AttendanceSessionStatusActive),
		},
		presentStudentIDs: []string{"student_001"},
	}
	uc := usecase.NewSelectAttendanceRandomStudents(repo, &fixedRandomFloats{values: []float64{0}})

	selection, err := uc.Execute(context.Background(), domain.AttendanceRandomSelectionInput{
		Principal: teacherPrincipal(),
		SessionID: "att_sess_fixed",
		Count:     2,
		Candidates: []domain.AttendanceSelectionCandidate{
			{StudentID: "student_001"},
			{StudentID: "student_002"},
		},
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if selection.EligibleCount != 1 || selection.Selected[0].StudentID != "student_002" {
		t.Fatalf("selection = %#v", selection)
	}
	if repo.gets != 1 || repo.presentReads != 1 {
		t.Fatalf("repo gets=%d presentReads=%d, want 1/1", repo.gets, repo.presentReads)
	}
}

func TestSelectAttendanceRandomStudentsSkipsPresentReadWhenDisabled(t *testing.T) {
	repo := &fakeAttendanceRandomSelectionRepository{
		sessions: map[string]domain.AttendanceSession{
			"att_sess_fixed": attendanceSession("att_sess_fixed", domain.AttendanceSessionStatusActive),
		},
	}
	uc := usecase.NewSelectAttendanceRandomStudents(repo, &fixedRandomFloats{values: []float64{0}})

	_, err := uc.Execute(context.Background(), domain.AttendanceRandomSelectionInput{
		Principal:         teacherPrincipal(),
		SessionID:         "att_sess_fixed",
		HasExcludePresent: true,
		ExcludePresent:    false,
		Candidates:        []domain.AttendanceSelectionCandidate{{StudentID: "student_001"}},
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if repo.presentReads != 0 {
		t.Fatalf("presentReads = %d, want 0", repo.presentReads)
	}
}

func TestSelectAttendanceRandomStudentsRejectsUnauthorizedBeforeRepositoryAccess(t *testing.T) {
	repo := &fakeAttendanceRandomSelectionRepository{}
	uc := usecase.NewSelectAttendanceRandomStudents(repo, &fixedRandomFloats{})

	_, err := uc.Execute(context.Background(), domain.AttendanceRandomSelectionInput{
		Principal:  studentPrincipal("student_001"),
		SessionID:  "att_sess_fixed",
		Candidates: []domain.AttendanceSelectionCandidate{{StudentID: "student_001"}},
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.gets != 0 || repo.presentReads != 0 {
		t.Fatalf("repo gets=%d presentReads=%d, want 0/0", repo.gets, repo.presentReads)
	}
}

func TestSelectAttendanceRandomStudentsReturnsNotFoundForMissingSession(t *testing.T) {
	uc := usecase.NewSelectAttendanceRandomStudents(&fakeAttendanceRandomSelectionRepository{}, &fixedRandomFloats{})

	_, err := uc.Execute(context.Background(), domain.AttendanceRandomSelectionInput{
		Principal:  teacherPrincipal(),
		SessionID:  "att_sess_missing",
		Candidates: []domain.AttendanceSelectionCandidate{{StudentID: "student_001"}},
	})
	if !errors.Is(err, domain.ErrAttendanceSessionNotFound) {
		t.Fatalf("error = %v, want ErrAttendanceSessionNotFound", err)
	}
}

func TestSelectAttendanceRandomStudentsRejectsEndedSession(t *testing.T) {
	repo := &fakeAttendanceRandomSelectionRepository{
		sessions: map[string]domain.AttendanceSession{
			"att_sess_fixed": attendanceSession("att_sess_fixed", domain.AttendanceSessionStatusEnded),
		},
	}
	uc := usecase.NewSelectAttendanceRandomStudents(repo, &fixedRandomFloats{})

	_, err := uc.Execute(context.Background(), domain.AttendanceRandomSelectionInput{
		Principal:  teacherPrincipal(),
		SessionID:  "att_sess_fixed",
		Candidates: []domain.AttendanceSelectionCandidate{{StudentID: "student_001"}},
	})
	if !errors.Is(err, domain.ErrAttendanceSessionNotActive) {
		t.Fatalf("error = %v, want ErrAttendanceSessionNotActive", err)
	}
}

type fakeAttendanceRandomSelectionRepository struct {
	sessions          map[string]domain.AttendanceSession
	presentStudentIDs []string
	gets              int
	presentReads      int
}

func (f *fakeAttendanceRandomSelectionRepository) GetAttendanceSessionByID(
	_ context.Context,
	id string,
) (domain.AttendanceSession, bool, error) {
	f.gets++
	session, ok := f.sessions[id]
	return session, ok, nil
}

func (f *fakeAttendanceRandomSelectionRepository) ListAttendancePresentStudentIDs(
	_ context.Context,
	sessionID string,
) ([]string, error) {
	f.presentReads++
	return append([]string(nil), f.presentStudentIDs...), nil
}

type fixedRandomFloats struct {
	values []float64
	index  int
}

func (f *fixedRandomFloats) Float64() float64 {
	if len(f.values) == 0 {
		return 0
	}
	if f.index >= len(f.values) {
		return f.values[len(f.values)-1]
	}
	value := f.values[f.index]
	f.index++
	return value
}
