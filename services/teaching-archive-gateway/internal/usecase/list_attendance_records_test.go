package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestListAttendanceRecordsScopesStudentRowsAndBuildsPage(t *testing.T) {
	repo := &fakeAttendanceRecordListRepository{
		sessions: map[string]domain.AttendanceSession{
			"att_sess_fixed": attendanceSession("att_sess_fixed", domain.AttendanceSessionStatusActive),
		},
		records: []domain.AttendanceRecord{
			attendanceUsecaseRecord("att_rec_2", "att_sess_fixed", "student_001", time.Date(2026, 5, 30, 12, 2, 0, 0, time.UTC)),
			attendanceUsecaseRecord("att_rec_other", "att_sess_fixed", "student_002", time.Date(2026, 5, 30, 12, 1, 30, 0, time.UTC)),
			attendanceUsecaseRecord("att_rec_1", "att_sess_fixed", "student_001", time.Date(2026, 5, 30, 12, 1, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewListAttendanceRecords(repo)

	page, err := uc.Execute(context.Background(), domain.ListAttendanceRecordsInput{
		Principal: studentPrincipal("student_001"),
		SessionID: "att_sess_fixed",
		PageSize:  1,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if repo.lastQuery.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", repo.lastQuery.StudentID)
	}
	if repo.lastQuery.FetchLimit != 2 {
		t.Fatalf("FetchLimit = %d", repo.lastQuery.FetchLimit)
	}
	if len(page.Items) != 1 || page.Items[0].ID != "att_rec_2" {
		t.Fatalf("items = %#v", page.Items)
	}
	if !page.PageInfo.HasMore || page.PageInfo.NextCursor == "" {
		t.Fatalf("PageInfo = %#v", page.PageInfo)
	}
}

func TestListAttendanceRecordsScopesAssignedTeacherRows(t *testing.T) {
	repo := &fakeAttendanceRecordListRepository{
		sessions: map[string]domain.AttendanceSession{
			"att_sess_fixed": attendanceSession("att_sess_fixed", domain.AttendanceSessionStatusActive),
		},
		records: []domain.AttendanceRecord{
			attendanceUsecaseRecord("att_rec_1", "att_sess_fixed", "student_001", time.Date(2026, 5, 30, 12, 1, 0, 0, time.UTC)),
			attendanceUsecaseRecord("att_rec_other", "att_sess_fixed", "student_003", time.Date(2026, 5, 30, 12, 2, 0, 0, time.UTC)),
			attendanceUsecaseRecord("att_rec_2", "att_sess_fixed", "student_002", time.Date(2026, 5, 30, 12, 3, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewListAttendanceRecords(repo)

	page, err := uc.Execute(context.Background(), domain.ListAttendanceRecordsInput{
		Principal: teacherPrincipalWithStudents("student_001", "student_002"),
		SessionID: "att_sess_fixed",
		PageSize:  10,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if len(repo.lastQuery.StudentIDs) != 2 {
		t.Fatalf("StudentIDs = %#v", repo.lastQuery.StudentIDs)
	}
	if len(page.Items) != 2 {
		t.Fatalf("items = %#v", page.Items)
	}
	for _, item := range page.Items {
		if item.StudentID == "student_003" {
			t.Fatalf("unassigned student leaked into page: %#v", page.Items)
		}
	}
}

func TestListAttendanceRecordsReturnsNotFoundForMissingSession(t *testing.T) {
	uc := usecase.NewListAttendanceRecords(&fakeAttendanceRecordListRepository{})

	_, err := uc.Execute(context.Background(), domain.ListAttendanceRecordsInput{
		Principal: teacherPrincipalWithStudents("student_001"),
		SessionID: "att_sess_missing",
		PageSize:  10,
	})
	if !errors.Is(err, domain.ErrAttendanceSessionNotFound) {
		t.Fatalf("error = %v, want ErrAttendanceSessionNotFound", err)
	}
}

type fakeAttendanceRecordListRepository struct {
	sessions  map[string]domain.AttendanceSession
	records   []domain.AttendanceRecord
	lastQuery domain.AttendanceRecordQuery
}

func (f *fakeAttendanceRecordListRepository) GetAttendanceSessionByID(
	_ context.Context,
	id string,
) (domain.AttendanceSession, bool, error) {
	session, ok := f.sessions[id]
	return session, ok, nil
}

func (f *fakeAttendanceRecordListRepository) ListAttendanceRecords(
	_ context.Context,
	query domain.AttendanceRecordQuery,
) ([]domain.AttendanceRecord, error) {
	f.lastQuery = query
	records := make([]domain.AttendanceRecord, 0, len(f.records))
	for _, record := range f.records {
		if record.SessionID != query.SessionID {
			continue
		}
		if query.StudentID != "" && record.StudentID != query.StudentID {
			continue
		}
		if len(query.StudentIDs) > 0 && !containsUsecaseString(query.StudentIDs, record.StudentID) {
			continue
		}
		records = append(records, record)
		if query.FetchLimit > 0 && len(records) >= query.FetchLimit {
			break
		}
	}
	return records, nil
}

func attendanceUsecaseRecord(id string, sessionID string, studentID string, createdAt time.Time) domain.AttendanceRecord {
	return domain.AttendanceRecord{
		ID:                    id,
		SessionID:             sessionID,
		StudentID:             studentID,
		Status:                domain.AttendanceRecordStatusPresent,
		RecordedByPrincipalID: "teacher_001",
		SignTime:              createdAt,
		CreatedAt:             createdAt,
	}
}

func containsUsecaseString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
