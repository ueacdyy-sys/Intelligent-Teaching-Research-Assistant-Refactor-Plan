package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type AttendanceRecordReader interface {
	GetAttendanceSessionByID(ctx context.Context, id string) (domain.AttendanceSession, bool, error)
	ListAttendanceRecords(ctx context.Context, query domain.AttendanceRecordQuery) ([]domain.AttendanceRecord, error)
}

type ListAttendanceRecords struct {
	reader AttendanceRecordReader
}

func NewListAttendanceRecords(reader AttendanceRecordReader) *ListAttendanceRecords {
	return &ListAttendanceRecords{reader: reader}
}

func (uc *ListAttendanceRecords) Execute(
	ctx context.Context,
	input domain.ListAttendanceRecordsInput,
) (domain.AttendanceRecordPage, error) {
	query, err := domain.NormalizeListAttendanceRecordsInput(input)
	if err != nil {
		return domain.AttendanceRecordPage{}, err
	}

	session, ok, err := uc.reader.GetAttendanceSessionByID(ctx, query.SessionID)
	if err != nil {
		return domain.AttendanceRecordPage{}, err
	}
	if !ok {
		return domain.AttendanceRecordPage{}, domain.ErrAttendanceSessionNotFound
	}

	scopedQuery, err := domain.ScopeListAttendanceRecords(input.Principal, session, query)
	if err != nil {
		return domain.AttendanceRecordPage{}, err
	}
	records, err := uc.reader.ListAttendanceRecords(ctx, scopedQuery)
	if err != nil {
		return domain.AttendanceRecordPage{}, err
	}
	return domain.BuildAttendanceRecordPage(records, scopedQuery.PageSize)
}
