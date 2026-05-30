package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestListStudentAppAITutorRequestsScopesOwnStudentBeforeRepository(t *testing.T) {
	reader := &fakeTutoringAnalysisRequestReader{
		requests: []domain.TutoringAnalysisRequest{
			tutoringRequest("tutor_req_own", "tarch_own", "student_001", time.Date(2026, 5, 30, 11, 0, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewListStudentAppAITutorRequests(reader)

	page, err := uc.Execute(context.Background(), domain.ListStudentAppAITutorRequestsInput{
		Principal: studentPrincipal("student_001"),
		Status:    domain.TutoringAnalysisStatusQueued,
		PageSize:  10,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if reader.query.SourceArchiveOwnerType != domain.OwnerTypeStudent {
		t.Fatalf("SourceArchiveOwnerType = %q", reader.query.SourceArchiveOwnerType)
	}
	if reader.query.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", reader.query.StudentID)
	}
	if reader.query.Status != domain.TutoringAnalysisStatusQueued {
		t.Fatalf("Status = %q", reader.query.Status)
	}
	if len(page.Items) != 1 {
		t.Fatalf("items = %d", len(page.Items))
	}
}

func TestListStudentAppAITutorRequestsRejectsForbiddenWithoutRepositoryRead(t *testing.T) {
	reader := &fakeTutoringAnalysisRequestReader{}
	uc := usecase.NewListStudentAppAITutorRequests(reader)

	_, err := uc.Execute(context.Background(), domain.ListStudentAppAITutorRequestsInput{
		Principal: remotePrincipal(),
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.reads != 0 {
		t.Fatalf("reader reads = %d", reader.reads)
	}
}
