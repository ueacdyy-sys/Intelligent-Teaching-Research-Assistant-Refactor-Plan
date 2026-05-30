package usecase_test

import (
	"context"
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestGetAttendanceStatisticsReturnsAggregate(t *testing.T) {
	repo := &fakeAttendanceStatisticsRepository{
		stats: domain.AttendanceStatistics{
			TotalStudents:   42,
			TotalRecords:    10,
			AttendanceCount: 8,
			AbsenceCount:    1,
			LateCount:       1,
			AttendanceRate:  0.8,
		},
	}
	uc := usecase.NewGetAttendanceStatistics(repo)

	stats, err := uc.Execute(context.Background(), domain.AttendanceStatisticsInput{
		Principal: teacherPrincipal(),
		ClassName: " Class A ",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if repo.lastQuery.ClassName != "Class A" {
		t.Fatalf("ClassName = %q", repo.lastQuery.ClassName)
	}
	if stats.AttendanceRate != 0.8 || stats.TotalRecords != 10 {
		t.Fatalf("stats = %#v", stats)
	}
}

func TestGetAttendanceStatisticsRejectsBeforeRepositoryAccess(t *testing.T) {
	repo := &fakeAttendanceStatisticsRepository{}
	uc := usecase.NewGetAttendanceStatistics(repo)

	_, err := uc.Execute(context.Background(), domain.AttendanceStatisticsInput{
		Principal: studentPrincipal("student_001"),
		ClassName: "Class A",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.calls != 0 {
		t.Fatalf("repository calls = %d, want 0", repo.calls)
	}
}

type fakeAttendanceStatisticsRepository struct {
	stats     domain.AttendanceStatistics
	lastQuery domain.AttendanceStatisticsQuery
	calls     int
}

func (f *fakeAttendanceStatisticsRepository) GetAttendanceStatistics(
	_ context.Context,
	query domain.AttendanceStatisticsQuery,
) (domain.AttendanceStatistics, error) {
	f.calls++
	f.lastQuery = query
	return f.stats, nil
}
