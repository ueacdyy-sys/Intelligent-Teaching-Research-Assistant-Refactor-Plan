package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type AttendanceSessionRepository interface {
	CreateAttendanceSession(ctx context.Context, session domain.AttendanceSession) error
}

type CreateAttendanceSession struct {
	repository AttendanceSessionRepository
	ids        IDGenerator
	clock      Clock
}

func NewCreateAttendanceSession(
	repository AttendanceSessionRepository,
	ids IDGenerator,
	clock Clock,
) *CreateAttendanceSession {
	return &CreateAttendanceSession{
		repository: repository,
		ids:        ids,
		clock:      clock,
	}
}

func (uc *CreateAttendanceSession) Execute(
	ctx context.Context,
	input domain.CreateAttendanceSessionInput,
) (domain.AttendanceSession, error) {
	session, err := domain.NewAttendanceSession(uc.ids.NewID(), input, uc.clock.Now())
	if err != nil {
		return domain.AttendanceSession{}, err
	}
	if err := uc.repository.CreateAttendanceSession(ctx, session); err != nil {
		return domain.AttendanceSession{}, err
	}
	return session, nil
}
