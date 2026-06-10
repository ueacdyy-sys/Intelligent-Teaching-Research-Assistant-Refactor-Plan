package usecase_test

import (
	"context"
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadStudentAppAITutorRequestProgressSummaryScopesOwnStudentBeforeCount(t *testing.T) {
	reader := &fakeStudentAppAITutorRequestProgressSummaryReader{
		statusCounts: map[domain.TutoringAnalysisStatus]int{
			domain.TutoringAnalysisStatusQueued:     1,
			domain.TutoringAnalysisStatusInProgress: 1,
			domain.TutoringAnalysisStatusSucceeded:  2,
			domain.TutoringAnalysisStatusFailed:     1,
		},
	}
	uc := usecase.NewReadStudentAppAITutorRequestProgressSummary(reader)

	summary, err := uc.Execute(context.Background(), domain.ReadStudentAppAITutorRequestProgressSummaryInput{
		Principal: studentPrincipal("student_001"),
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if reader.query.SourceArchiveOwnerType != domain.OwnerTypeStudent ||
		reader.query.StudentID != "student_001" ||
		reader.query.FetchLimit != 0 {
		t.Fatalf("query = %#v", reader.query)
	}
	if reader.countReads != 1 || reader.listReads != 0 {
		t.Fatalf("countReads/listReads = %d/%d", reader.countReads, reader.listReads)
	}
	if summary.TotalCount != 5 ||
		summary.AutoRefreshCount != 2 ||
		summary.ActionReadyCount != 2 ||
		summary.TeacherReviewRequiredCount != 1 ||
		summary.FailedCount != 1 {
		t.Fatalf("summary = %#v", summary)
	}
}

func TestReadStudentAppAITutorRequestProgressSummaryRejectsForbiddenBeforeCount(t *testing.T) {
	reader := &fakeStudentAppAITutorRequestProgressSummaryReader{}
	uc := usecase.NewReadStudentAppAITutorRequestProgressSummary(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppAITutorRequestProgressSummaryInput{
		Principal: remotePrincipal(),
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.countReads != 0 || reader.listReads != 0 {
		t.Fatalf("countReads/listReads = %d/%d", reader.countReads, reader.listReads)
	}
}

type fakeStudentAppAITutorRequestProgressSummaryReader struct {
	query        domain.TutoringAnalysisRequestQuery
	statusCounts map[domain.TutoringAnalysisStatus]int
	countReads   int
	listReads    int
}

func (f *fakeStudentAppAITutorRequestProgressSummaryReader) CountTutoringAnalysisRequestsByStatus(
	_ context.Context,
	query domain.TutoringAnalysisRequestQuery,
) (map[domain.TutoringAnalysisStatus]int, error) {
	f.query = query
	f.countReads++
	return f.statusCounts, nil
}

func (f *fakeStudentAppAITutorRequestProgressSummaryReader) ListTutoringAnalysisRequests(
	context.Context,
	domain.TutoringAnalysisRequestQuery,
) ([]domain.TutoringAnalysisRequest, error) {
	f.listReads++
	return nil, nil
}
