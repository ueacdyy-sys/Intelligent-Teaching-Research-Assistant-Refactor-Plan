package usecase_test

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestListAIGradingRequestsNormalizesFiltersAndBuildsNextCursor(t *testing.T) {
	reader := &fakeAIGradingRequestReader{
		requests: []domain.AIGradingRequest{
			aiGradingRequest("grading_req_3", "tarch_3", "student_001", time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC)),
			aiGradingRequest("grading_req_2", "tarch_2", "student_001", time.Date(2026, 5, 29, 10, 2, 0, 0, time.UTC)),
			aiGradingRequest("grading_req_1", "tarch_1", "student_001", time.Date(2026, 5, 29, 10, 1, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewListAIGradingRequests(reader)

	page, err := uc.Execute(context.Background(), domain.ListAIGradingRequestsInput{
		Principal:              teacherPrincipal(),
		Status:                 domain.AIGradingStatusQueued,
		ArchiveItemID:          " tarch_3 ",
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		StudentID:              " student_001 ",
		PageSize:               2,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if reader.query.ArchiveItemID != "tarch_3" {
		t.Fatalf("ArchiveItemID = %q", reader.query.ArchiveItemID)
	}
	if reader.query.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", reader.query.StudentID)
	}
	if reader.query.FetchLimit != 3 {
		t.Fatalf("FetchLimit = %d", reader.query.FetchLimit)
	}
	if len(page.Items) != 2 {
		t.Fatalf("items = %d", len(page.Items))
	}
	if !page.PageInfo.HasMore || page.PageInfo.NextCursor == "" {
		t.Fatalf("pageInfo = %#v", page.PageInfo)
	}
}

func TestListAIGradingRequestsScopesStudentOwnBeforeRepository(t *testing.T) {
	reader := &fakeAIGradingRequestReader{}
	uc := usecase.NewListAIGradingRequests(reader)

	_, err := uc.Execute(context.Background(), domain.ListAIGradingRequestsInput{
		Principal:              studentPrincipal("student_001"),
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if reader.query.SourceArchiveOwnerType != domain.OwnerTypeStudent {
		t.Fatalf("SourceArchiveOwnerType = %q", reader.query.SourceArchiveOwnerType)
	}
	if reader.query.StudentID != "student_001" {
		t.Fatalf("StudentID = %q, want student_001", reader.query.StudentID)
	}
}

func TestListAIGradingRequestsScopesAssignedStudentIDsBeforeRepository(t *testing.T) {
	reader := &fakeAIGradingRequestReader{}
	uc := usecase.NewListAIGradingRequests(reader)

	_, err := uc.Execute(context.Background(), domain.ListAIGradingRequestsInput{
		Principal:              teacherPrincipalWithStudents("student_001", "student_002"),
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if !reflect.DeepEqual(reader.query.StudentIDs, []string{"student_001", "student_002"}) {
		t.Fatalf("StudentIDs = %#v", reader.query.StudentIDs)
	}
}

func TestListAIGradingRequestsRejectsRemoteSocialPrincipal(t *testing.T) {
	reader := &fakeAIGradingRequestReader{}
	uc := usecase.NewListAIGradingRequests(reader)

	_, err := uc.Execute(context.Background(), domain.ListAIGradingRequestsInput{
		Principal:              remotePrincipal(),
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.reads != 0 {
		t.Fatalf("reader reads = %d", reader.reads)
	}
}

type fakeAIGradingRequestReader struct {
	query    domain.AIGradingRequestQuery
	requests []domain.AIGradingRequest
	reads    int
}

func (f *fakeAIGradingRequestReader) ListAIGradingRequests(
	_ context.Context,
	query domain.AIGradingRequestQuery,
) ([]domain.AIGradingRequest, error) {
	f.query = query
	f.reads++
	return f.requests, nil
}

func aiGradingRequest(id string, archiveItemID string, studentID string, createdAt time.Time) domain.AIGradingRequest {
	return domain.AIGradingRequest{
		ID:                     id,
		ArchiveItemID:          archiveItemID,
		RequestedByPrincipalID: studentID,
		GradingInstructions:    "grade short answers",
		Status:                 domain.AIGradingStatusQueued,
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		SourceArchiveStudentID: studentID,
		SourceArchiveMaterial:  domain.MaterialTypeQuiz,
		SourceArchiveOCRStatus: domain.OCRStatusReserved,
		CreatedAt:              createdAt,
		UpdatedAt:              createdAt,
	}
}
