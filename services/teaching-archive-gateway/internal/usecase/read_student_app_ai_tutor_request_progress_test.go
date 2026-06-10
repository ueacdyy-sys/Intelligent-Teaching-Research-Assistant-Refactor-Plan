package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadStudentAppAITutorRequestProgressScopesOwnRequestBeforeRepository(t *testing.T) {
	reader := &fakeStudentAppAITutorRequestProgressReader{
		requests: []domain.TutoringAnalysisRequest{
			tutoringRequest("tutor_req_progress_detail", "tarch_detail", "student_001", time.Date(2026, 6, 10, 10, 0, 0, 0, time.UTC)),
			tutoringRequest("tutor_req_other_student", "tarch_other", "student_002", time.Date(2026, 6, 10, 10, 1, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewReadStudentAppAITutorRequestProgress(reader)

	card, err := uc.Execute(context.Background(), domain.ReadStudentAppAITutorRequestProgressInput{
		Principal: studentPrincipal("student_001"),
		RequestID: " tutor_req_progress_detail ",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if reader.query.ID != "tutor_req_progress_detail" ||
		reader.query.SourceArchiveOwnerType != domain.OwnerTypeStudent ||
		reader.query.StudentID != "student_001" ||
		reader.query.FetchLimit != 1 {
		t.Fatalf("query = %#v", reader.query)
	}
	if card.ID != "tutor_req_progress_detail" ||
		card.ProgressStage != domain.StudentAppAITutorProgressStageQueued ||
		card.NextStudentAction != domain.StudentAppAITutorNextActionWaitForAITutor {
		t.Fatalf("card = %#v", card)
	}
}

func TestReadStudentAppAITutorRequestProgressReturnsNotFoundForCrossStudentRequest(t *testing.T) {
	reader := &fakeStudentAppAITutorRequestProgressReader{
		requests: []domain.TutoringAnalysisRequest{
			tutoringRequest("tutor_req_other_student", "tarch_other", "student_002", time.Date(2026, 6, 10, 10, 1, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewReadStudentAppAITutorRequestProgress(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppAITutorRequestProgressInput{
		Principal: studentPrincipal("student_001"),
		RequestID: "tutor_req_other_student",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
	if reader.query.ID != "tutor_req_other_student" || reader.query.StudentID != "student_001" {
		t.Fatalf("query = %#v", reader.query)
	}
}

func TestReadStudentAppAITutorRequestProgressRejectsForbiddenBeforeRepositoryRead(t *testing.T) {
	reader := &fakeStudentAppAITutorRequestProgressReader{}
	uc := usecase.NewReadStudentAppAITutorRequestProgress(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppAITutorRequestProgressInput{
		Principal: remotePrincipal(),
		RequestID: "tutor_req_progress_detail",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.reads != 0 {
		t.Fatalf("reader reads = %d", reader.reads)
	}
}

type fakeStudentAppAITutorRequestProgressReader struct {
	query    domain.TutoringAnalysisRequestQuery
	requests []domain.TutoringAnalysisRequest
	reads    int
}

func (f *fakeStudentAppAITutorRequestProgressReader) ListTutoringAnalysisRequests(
	_ context.Context,
	query domain.TutoringAnalysisRequestQuery,
) ([]domain.TutoringAnalysisRequest, error) {
	f.query = query
	f.reads++
	requests := make([]domain.TutoringAnalysisRequest, 0, len(f.requests))
	for _, request := range f.requests {
		if query.ID != "" && request.ID != query.ID {
			continue
		}
		if query.SourceArchiveOwnerType != "" && request.SourceArchiveOwnerType != query.SourceArchiveOwnerType {
			continue
		}
		if query.StudentID != "" && request.SourceArchiveStudentID != query.StudentID {
			continue
		}
		requests = append(requests, request)
		if query.FetchLimit > 0 && len(requests) >= query.FetchLimit {
			break
		}
	}
	return requests, nil
}
