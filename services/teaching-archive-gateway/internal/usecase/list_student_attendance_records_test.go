package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestListStudentAttendanceRecordsScopesRowsAndBuildsPage(t *testing.T) {
	repo := &fakeStudentAttendanceRecordListRepository{
		records: []domain.AttendanceRecord{
			attendanceUsecaseRecord("att_rec_2", "att_sess_fixed", "student_001", time.Date(2026, 5, 30, 12, 2, 0, 0, time.UTC)),
			attendanceUsecaseRecord("att_rec_other", "att_sess_fixed", "student_002", time.Date(2026, 5, 30, 12, 1, 30, 0, time.UTC)),
			attendanceUsecaseRecord("att_rec_1", "att_sess_earlier", "student_001", time.Date(2026, 5, 30, 12, 1, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewListStudentAttendanceRecords(repo)

	page, err := uc.Execute(context.Background(), domain.ListStudentAttendanceRecordsInput{
		Principal: studentPrincipal("student_001"),
		StudentID: "student_001",
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

func TestListStudentAttendanceRecordsRejectsBeforeRepositoryList(t *testing.T) {
	repo := &fakeStudentAttendanceRecordListRepository{}
	uc := usecase.NewListStudentAttendanceRecords(repo)

	_, err := uc.Execute(context.Background(), domain.ListStudentAttendanceRecordsInput{
		Principal: studentPrincipal("student_001"),
		StudentID: "student_002",
		PageSize:  10,
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.calls != 0 {
		t.Fatalf("repository calls = %d, want 0", repo.calls)
	}
}

type fakeStudentAttendanceRecordListRepository struct {
	records   []domain.AttendanceRecord
	lastQuery domain.StudentAttendanceRecordQuery
	calls     int
}

func (f *fakeStudentAttendanceRecordListRepository) ListStudentAttendanceRecords(
	_ context.Context,
	query domain.StudentAttendanceRecordQuery,
) ([]domain.AttendanceRecord, error) {
	f.calls++
	f.lastQuery = query
	records := make([]domain.AttendanceRecord, 0, len(f.records))
	for _, record := range f.records {
		if query.StudentID != "" && record.StudentID != query.StudentID {
			continue
		}
		records = append(records, record)
		if query.FetchLimit > 0 && len(records) >= query.FetchLimit {
			break
		}
	}
	return records, nil
}
