package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type SignInAttendanceRepository interface {
	GetAttendanceSessionByID(ctx context.Context, id string) (domain.AttendanceSession, bool, error)
	CreateAttendanceRecord(ctx context.Context, record domain.AttendanceRecord) (domain.AttendanceRecord, bool, error)
}

type SignInAttendance struct {
	repository SignInAttendanceRepository
	ids        IDGenerator
	clock      Clock
}

func NewSignInAttendance(
	repository SignInAttendanceRepository,
	ids IDGenerator,
	clock Clock,
) *SignInAttendance {
	return &SignInAttendance{
		repository: repository,
		ids:        ids,
		clock:      clock,
	}
}

func (uc *SignInAttendance) Execute(
	ctx context.Context,
	input domain.AttendanceSignInInput,
) (AttendanceRecordResult, error) {
	now := uc.clock.Now()
	normalized, err := domain.NormalizeAttendanceSignInInput(input, now)
	if err != nil {
		return AttendanceRecordResult{}, err
	}

	session, ok, err := uc.repository.GetAttendanceSessionByID(ctx, normalized.SessionID)
	if err != nil {
		return AttendanceRecordResult{}, err
	}
	if !ok {
		return AttendanceRecordResult{}, domain.ErrAttendanceSessionNotFound
	}

	record, err := domain.NewAttendanceSignInRecord(uc.ids.NewID(), session, normalized, now)
	if err != nil {
		return AttendanceRecordResult{}, err
	}
	persisted, created, err := uc.repository.CreateAttendanceRecord(ctx, record)
	if err != nil {
		return AttendanceRecordResult{}, err
	}
	return AttendanceRecordResult{Record: persisted, Created: created}, nil
}
