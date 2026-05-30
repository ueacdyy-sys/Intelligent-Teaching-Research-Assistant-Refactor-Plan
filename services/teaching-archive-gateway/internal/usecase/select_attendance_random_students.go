package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type AttendanceRandomSelectionRepository interface {
	GetAttendanceSessionByID(ctx context.Context, id string) (domain.AttendanceSession, bool, error)
	ListAttendancePresentStudentIDs(ctx context.Context, sessionID string) ([]string, error)
}

type SelectAttendanceRandomStudents struct {
	repository AttendanceRandomSelectionRepository
	random     domain.AttendanceRandomSource
}

func NewSelectAttendanceRandomStudents(
	repository AttendanceRandomSelectionRepository,
	random domain.AttendanceRandomSource,
) *SelectAttendanceRandomStudents {
	return &SelectAttendanceRandomStudents{
		repository: repository,
		random:     random,
	}
}

func (uc *SelectAttendanceRandomStudents) Execute(
	ctx context.Context,
	input domain.AttendanceRandomSelectionInput,
) (domain.AttendanceRandomSelection, error) {
	normalized, err := domain.NormalizeAttendanceRandomSelectionInput(input)
	if err != nil {
		return domain.AttendanceRandomSelection{}, err
	}

	session, ok, err := uc.repository.GetAttendanceSessionByID(ctx, normalized.SessionID)
	if err != nil {
		return domain.AttendanceRandomSelection{}, err
	}
	if !ok {
		return domain.AttendanceRandomSelection{}, domain.ErrAttendanceSessionNotFound
	}
	if session.Status != domain.AttendanceSessionStatusActive {
		return domain.AttendanceRandomSelection{}, domain.ErrAttendanceSessionNotActive
	}

	var present map[string]struct{}
	if normalized.ExcludePresent {
		studentIDs, err := uc.repository.ListAttendancePresentStudentIDs(ctx, normalized.SessionID)
		if err != nil {
			return domain.AttendanceRandomSelection{}, err
		}
		present = domain.BuildAttendancePresentStudentSet(studentIDs)
	}

	return domain.SelectAttendanceRandomStudents(session, normalized, present, uc.random)
}
