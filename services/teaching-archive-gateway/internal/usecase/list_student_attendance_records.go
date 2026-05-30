package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type StudentAttendanceRecordReader interface {
	ListStudentAttendanceRecords(ctx context.Context, query domain.StudentAttendanceRecordQuery) ([]domain.AttendanceRecord, error)
}

type ListStudentAttendanceRecords struct {
	reader StudentAttendanceRecordReader
}

func NewListStudentAttendanceRecords(reader StudentAttendanceRecordReader) *ListStudentAttendanceRecords {
	return &ListStudentAttendanceRecords{reader: reader}
}

func (uc *ListStudentAttendanceRecords) Execute(
	ctx context.Context,
	input domain.ListStudentAttendanceRecordsInput,
) (domain.AttendanceRecordPage, error) {
	query, err := domain.NormalizeListStudentAttendanceRecordsInput(input)
	if err != nil {
		return domain.AttendanceRecordPage{}, err
	}
	scopedQuery, err := domain.ScopeListStudentAttendanceRecords(input.Principal, query)
	if err != nil {
		return domain.AttendanceRecordPage{}, err
	}
	records, err := uc.reader.ListStudentAttendanceRecords(ctx, scopedQuery)
	if err != nil {
		return domain.AttendanceRecordPage{}, err
	}
	return domain.BuildStudentAttendanceRecordPage(records, scopedQuery.PageSize)
}
