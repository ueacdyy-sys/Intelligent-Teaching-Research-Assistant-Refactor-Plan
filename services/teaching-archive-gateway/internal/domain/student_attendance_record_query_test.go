package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeListStudentAttendanceRecordsInputBuildsBoundedQuery(t *testing.T) {
	cursorSource := attendanceRecord("att_rec_cursor", "student_001", time.Date(2026, 5, 30, 12, 3, 0, 0, time.UTC))
	cursor, err := domain.EncodeAttendanceRecordCursor(cursorSource)
	if err != nil {
		t.Fatalf("EncodeAttendanceRecordCursor returned error: %v", err)
	}

	query, err := domain.NormalizeListStudentAttendanceRecordsInput(domain.ListStudentAttendanceRecordsInput{
		Principal: teacherPrincipal(),
		StudentID: " student_001 ",
		PageSize:  2,
		Cursor:    cursor,
	})
	if err != nil {
		t.Fatalf("NormalizeListStudentAttendanceRecordsInput returned error: %v", err)
	}

	if query.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", query.StudentID)
	}
	if query.PageSize != 2 || query.FetchLimit != 3 {
		t.Fatalf("page/fetch = %d/%d", query.PageSize, query.FetchLimit)
	}
	if query.Cursor == nil || query.Cursor.ID != "att_rec_cursor" {
		t.Fatalf("Cursor = %#v", query.Cursor)
	}
}

func TestNormalizeListStudentAttendanceRecordsInputRejectsBadPageSize(t *testing.T) {
	_, err := domain.NormalizeListStudentAttendanceRecordsInput(domain.ListStudentAttendanceRecordsInput{
		StudentID: "student_001",
		PageSize:  101,
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestScopeListStudentAttendanceRecordsAllowsOwnStudent(t *testing.T) {
	query, err := domain.NormalizeListStudentAttendanceRecordsInput(domain.ListStudentAttendanceRecordsInput{
		StudentID: "student_001",
		PageSize:  10,
	})
	if err != nil {
		t.Fatalf("NormalizeListStudentAttendanceRecordsInput returned error: %v", err)
	}

	scoped, err := domain.ScopeListStudentAttendanceRecords(studentPrincipal("student_001"), query)
	if err != nil {
		t.Fatalf("ScopeListStudentAttendanceRecords returned error: %v", err)
	}
	if scoped.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", scoped.StudentID)
	}
}

func TestScopeListStudentAttendanceRecordsAllowsAssignedTeacher(t *testing.T) {
	query, err := domain.NormalizeListStudentAttendanceRecordsInput(domain.ListStudentAttendanceRecordsInput{
		StudentID: "student_002",
		PageSize:  10,
	})
	if err != nil {
		t.Fatalf("NormalizeListStudentAttendanceRecordsInput returned error: %v", err)
	}
	principal := teacherPrincipal()
	principal.StudentAccess.StudentIDs = []string{"student_001", "student_002"}

	scoped, err := domain.ScopeListStudentAttendanceRecords(principal, query)
	if err != nil {
		t.Fatalf("ScopeListStudentAttendanceRecords returned error: %v", err)
	}
	if scoped.StudentID != "student_002" {
		t.Fatalf("StudentID = %q", scoped.StudentID)
	}
}

func TestScopeListStudentAttendanceRecordsRejectsCrossStudent(t *testing.T) {
	query, err := domain.NormalizeListStudentAttendanceRecordsInput(domain.ListStudentAttendanceRecordsInput{
		StudentID: "student_002",
		PageSize:  10,
	})
	if err != nil {
		t.Fatalf("NormalizeListStudentAttendanceRecordsInput returned error: %v", err)
	}

	_, err = domain.ScopeListStudentAttendanceRecords(studentPrincipal("student_001"), query)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}
