package domain_test

import (
	"errors"
	"strings"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeAttendanceStatisticsInputTrimsClassName(t *testing.T) {
	query, err := domain.NormalizeAttendanceStatisticsInput(domain.AttendanceStatisticsInput{
		Principal: teacherPrincipal(),
		ClassName: " Class A ",
	})
	if err != nil {
		t.Fatalf("NormalizeAttendanceStatisticsInput returned error: %v", err)
	}
	if query.ClassName != "Class A" {
		t.Fatalf("ClassName = %q", query.ClassName)
	}
}

func TestNormalizeAttendanceStatisticsInputRejectsLongClassName(t *testing.T) {
	_, err := domain.NormalizeAttendanceStatisticsInput(domain.AttendanceStatisticsInput{
		ClassName: strings.Repeat("a", 129),
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestAuthorizeAttendanceStatisticsAllowsAssignedTeacher(t *testing.T) {
	query, err := domain.NormalizeAttendanceStatisticsInput(domain.AttendanceStatisticsInput{
		Principal: teacherPrincipal(),
		ClassName: "Class A",
	})
	if err != nil {
		t.Fatalf("NormalizeAttendanceStatisticsInput returned error: %v", err)
	}

	if err := domain.AuthorizeAttendanceStatisticsQuery(teacherPrincipal(), query); err != nil {
		t.Fatalf("AuthorizeAttendanceStatisticsQuery returned error: %v", err)
	}
}

func TestAuthorizeAttendanceStatisticsRejectsStudentOwn(t *testing.T) {
	query, err := domain.NormalizeAttendanceStatisticsInput(domain.AttendanceStatisticsInput{
		Principal: studentPrincipal("student_001"),
	})
	if err != nil {
		t.Fatalf("NormalizeAttendanceStatisticsInput returned error: %v", err)
	}

	err = domain.AuthorizeAttendanceStatisticsQuery(studentPrincipal("student_001"), query)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestBuildAttendanceStatisticsComputesLegacyShape(t *testing.T) {
	stats, err := domain.BuildAttendanceStatistics(42, 8, 1, 1)
	if err != nil {
		t.Fatalf("BuildAttendanceStatistics returned error: %v", err)
	}
	if stats.TotalStudents != 42 || stats.TotalRecords != 10 {
		t.Fatalf("stats = %#v", stats)
	}
	if stats.AttendanceRate != 0.8 {
		t.Fatalf("AttendanceRate = %v", stats.AttendanceRate)
	}
}

func TestBuildAttendanceStatisticsHandlesZeroRecords(t *testing.T) {
	stats, err := domain.BuildAttendanceStatistics(42, 0, 0, 0)
	if err != nil {
		t.Fatalf("BuildAttendanceStatistics returned error: %v", err)
	}
	if stats.TotalRecords != 0 || stats.AttendanceRate != 0 {
		t.Fatalf("stats = %#v", stats)
	}
}

func TestBuildAttendanceStatisticsRejectsNegativeCounts(t *testing.T) {
	_, err := domain.BuildAttendanceStatistics(42, -1, 0, 0)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}
