package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type AttendanceStatisticsReader interface {
	GetAttendanceStatistics(ctx context.Context, query domain.AttendanceStatisticsQuery) (domain.AttendanceStatistics, error)
}

type GetAttendanceStatistics struct {
	reader AttendanceStatisticsReader
}

func NewGetAttendanceStatistics(reader AttendanceStatisticsReader) *GetAttendanceStatistics {
	return &GetAttendanceStatistics{reader: reader}
}

func (uc *GetAttendanceStatistics) Execute(
	ctx context.Context,
	input domain.AttendanceStatisticsInput,
) (domain.AttendanceStatistics, error) {
	query, err := domain.NormalizeAttendanceStatisticsInput(input)
	if err != nil {
		return domain.AttendanceStatistics{}, err
	}
	if err := domain.AuthorizeAttendanceStatisticsQuery(input.Principal, query); err != nil {
		return domain.AttendanceStatistics{}, err
	}
	return uc.reader.GetAttendanceStatistics(ctx, query)
}
