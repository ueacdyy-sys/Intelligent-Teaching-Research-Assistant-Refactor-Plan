package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeListAttendanceRecordsInputBuildsBoundedQuery(t *testing.T) {
	cursorSource := attendanceRecord("att_rec_cursor", "student_001", time.Date(2026, 5, 30, 12, 3, 0, 0, time.UTC))
	cursor, err := domain.EncodeAttendanceRecordCursor(cursorSource)
	if err != nil {
		t.Fatalf("EncodeAttendanceRecordCursor returned error: %v", err)
	}

	query, err := domain.NormalizeListAttendanceRecordsInput(domain.ListAttendanceRecordsInput{
		Principal: teacherPrincipal(),
		SessionID: " att_sess_domain ",
		StudentID: " student_001 ",
		PageSize:  2,
		Cursor:    cursor,
	})
	if err != nil {
		t.Fatalf("NormalizeListAttendanceRecordsInput returned error: %v", err)
	}

	if query.SessionID != "att_sess_domain" {
		t.Fatalf("SessionID = %q", query.SessionID)
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

func TestNormalizeListAttendanceRecordsInputRejectsBadPageSize(t *testing.T) {
	_, err := domain.NormalizeListAttendanceRecordsInput(domain.ListAttendanceRecordsInput{
		SessionID: "att_sess_domain",
		PageSize:  101,
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestScopeListAttendanceRecordsLimitsStudentToOwnRow(t *testing.T) {
	query, err := domain.NormalizeListAttendanceRecordsInput(domain.ListAttendanceRecordsInput{
		SessionID: "att_sess_domain",
		PageSize:  10,
	})
	if err != nil {
		t.Fatalf("NormalizeListAttendanceRecordsInput returned error: %v", err)
	}

	scoped, err := domain.ScopeListAttendanceRecords(
		studentPrincipal("student_001"),
		activeAttendanceSession(),
		query,
	)
	if err != nil {
		t.Fatalf("ScopeListAttendanceRecords returned error: %v", err)
	}
	if scoped.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", scoped.StudentID)
	}
}

func TestScopeListAttendanceRecordsLimitsAssignedTeacherToAssignedRows(t *testing.T) {
	query, err := domain.NormalizeListAttendanceRecordsInput(domain.ListAttendanceRecordsInput{
		SessionID: "att_sess_domain",
		PageSize:  10,
	})
	if err != nil {
		t.Fatalf("NormalizeListAttendanceRecordsInput returned error: %v", err)
	}
	principal := teacherPrincipal()
	principal.StudentAccess.StudentIDs = []string{"student_001", "student_002"}

	scoped, err := domain.ScopeListAttendanceRecords(
		principal,
		activeAttendanceSession(),
		query,
	)
	if err != nil {
		t.Fatalf("ScopeListAttendanceRecords returned error: %v", err)
	}
	if scoped.StudentID != "" {
		t.Fatalf("StudentID = %q, want empty assigned-scope query", scoped.StudentID)
	}
	if len(scoped.StudentIDs) != 2 || scoped.StudentIDs[0] != "student_001" || scoped.StudentIDs[1] != "student_002" {
		t.Fatalf("StudentIDs = %#v", scoped.StudentIDs)
	}
}

func TestScopeListAttendanceRecordsRejectsCrossStudentFilter(t *testing.T) {
	query, err := domain.NormalizeListAttendanceRecordsInput(domain.ListAttendanceRecordsInput{
		SessionID: "att_sess_domain",
		StudentID: "student_002",
		PageSize:  10,
	})
	if err != nil {
		t.Fatalf("NormalizeListAttendanceRecordsInput returned error: %v", err)
	}

	_, err = domain.ScopeListAttendanceRecords(
		studentPrincipal("student_001"),
		activeAttendanceSession(),
		query,
	)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestBuildAttendanceRecordPageCreatesCursor(t *testing.T) {
	page, err := domain.BuildAttendanceRecordPage([]domain.AttendanceRecord{
		attendanceRecord("att_rec_2", "student_002", time.Date(2026, 5, 30, 12, 2, 0, 0, time.UTC)),
		attendanceRecord("att_rec_1", "student_001", time.Date(2026, 5, 30, 12, 1, 0, 0, time.UTC)),
	}, 1)
	if err != nil {
		t.Fatalf("BuildAttendanceRecordPage returned error: %v", err)
	}

	if len(page.Items) != 1 || page.Items[0].ID != "att_rec_2" {
		t.Fatalf("items = %#v", page.Items)
	}
	if !page.PageInfo.HasMore || page.PageInfo.NextCursor == "" {
		t.Fatalf("PageInfo = %#v", page.PageInfo)
	}
}

func attendanceRecord(id string, studentID string, createdAt time.Time) domain.AttendanceRecord {
	return domain.AttendanceRecord{
		ID:                    id,
		SessionID:             "att_sess_domain",
		StudentID:             studentID,
		Status:                domain.AttendanceRecordStatusPresent,
		RecordedByPrincipalID: "teacher_001",
		SignTime:              createdAt,
		CreatedAt:             createdAt,
	}
}
