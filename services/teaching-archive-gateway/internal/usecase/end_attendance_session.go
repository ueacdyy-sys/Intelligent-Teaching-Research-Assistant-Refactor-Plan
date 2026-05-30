package usecase

import (
	"context"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type EndAttendanceSessionRepository interface {
	EndAttendanceSession(ctx context.Context, id string, endedAt time.Time) (domain.AttendanceSession, bool, error)
}

type EndAttendanceSession struct {
	repository EndAttendanceSessionRepository
	clock      Clock
}

func NewEndAttendanceSession(
	repository EndAttendanceSessionRepository,
	clock Clock,
) *EndAttendanceSession {
	return &EndAttendanceSession{
		repository: repository,
		clock:      clock,
	}
}

func (uc *EndAttendanceSession) Execute(
	ctx context.Context,
	input domain.EndAttendanceSessionInput,
) (domain.AttendanceSession, error) {
	normalized, err := domain.NormalizeEndAttendanceSessionInput(input)
	if err != nil {
		return domain.AttendanceSession{}, err
	}

	session, ok, err := uc.repository.EndAttendanceSession(ctx, normalized.SessionID, uc.clock.Now())
	if err != nil {
		return domain.AttendanceSession{}, err
	}
	if !ok {
		return domain.AttendanceSession{}, domain.ErrAttendanceSessionNotFound
	}
	return session, nil
}
