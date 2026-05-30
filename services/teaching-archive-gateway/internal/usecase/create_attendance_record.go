package usecase

import (
	"context"
	"strings"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type AttendanceRecordRepository interface {
	GetAttendanceSessionByID(ctx context.Context, id string) (domain.AttendanceSession, bool, error)
	CreateAttendanceRecord(ctx context.Context, record domain.AttendanceRecord) (domain.AttendanceRecord, bool, error)
}

type CreateAttendanceRecord struct {
	repository AttendanceRecordRepository
	ids        IDGenerator
	clock      Clock
}

type AttendanceRecordResult struct {
	Record  domain.AttendanceRecord
	Created bool
}

func NewCreateAttendanceRecord(
	repository AttendanceRecordRepository,
	ids IDGenerator,
	clock Clock,
) *CreateAttendanceRecord {
	return &CreateAttendanceRecord{
		repository: repository,
		ids:        ids,
		clock:      clock,
	}
}

func (uc *CreateAttendanceRecord) Execute(
	ctx context.Context,
	input domain.CreateAttendanceRecordInput,
) (AttendanceRecordResult, error) {
	sessionID := strings.TrimSpace(input.SessionID)
	session, ok, err := uc.repository.GetAttendanceSessionByID(ctx, sessionID)
	if err != nil {
		return AttendanceRecordResult{}, err
	}
	if !ok {
		return AttendanceRecordResult{}, domain.ErrAttendanceSessionNotFound
	}

	record, err := domain.NewAttendanceRecord(uc.ids.NewID(), session, input, uc.clock.Now())
	if err != nil {
		return AttendanceRecordResult{}, err
	}
	persisted, created, err := uc.repository.CreateAttendanceRecord(ctx, record)
	if err != nil {
		return AttendanceRecordResult{}, err
	}
	return AttendanceRecordResult{Record: persisted, Created: created}, nil
}
