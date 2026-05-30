package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestListStudentAppQuestionBankDraftsProjectsOwnDraftMetadata(t *testing.T) {
	reader := &fakeTutoringAnalysisRequestReader{
		requests: []domain.TutoringAnalysisRequest{
			questionBankDraftRequest("tutor_req_draft", "tarch_own", "student_001", time.Date(2026, 5, 30, 11, 0, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewListStudentAppQuestionBankDrafts(reader)

	page, err := uc.Execute(context.Background(), domain.ListStudentAppQuestionBankDraftsInput{
		Principal: studentPrincipal("student_001"),
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
	if reader.query.Status != domain.TutoringAnalysisStatusSucceeded {
		t.Fatalf("Status = %q", reader.query.Status)
	}
	if !reader.query.RequireQuestionBankDraftRef {
		t.Fatalf("RequireQuestionBankDraftRef = false, want true")
	}
	if len(page.Items) != 1 {
		t.Fatalf("items = %d", len(page.Items))
	}
	draft := page.Items[0]
	if draft.TutoringAnalysisRequestID != "tutor_req_draft" {
		t.Fatalf("TutoringAnalysisRequestID = %q", draft.TutoringAnalysisRequestID)
	}
	if draft.QuestionBankDraftRef != "local://question-bank-drafts/tutor_req_draft.json" {
		t.Fatalf("QuestionBankDraftRef = %q", draft.QuestionBankDraftRef)
	}
}

func TestListStudentAppQuestionBankDraftsRejectsForbiddenWithoutRepositoryRead(t *testing.T) {
	reader := &fakeTutoringAnalysisRequestReader{}
	uc := usecase.NewListStudentAppQuestionBankDrafts(reader)

	_, err := uc.Execute(context.Background(), domain.ListStudentAppQuestionBankDraftsInput{
		Principal: remotePrincipal(),
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.reads != 0 {
		t.Fatalf("reader reads = %d", reader.reads)
	}
}

func questionBankDraftRequest(
	id string,
	archiveItemID string,
	studentID string,
	createdAt time.Time,
) domain.TutoringAnalysisRequest {
	request := tutoringRequest(id, archiveItemID, studentID, createdAt)
	request.Status = domain.TutoringAnalysisStatusSucceeded
	request.ResultSummary = "mastered fractions"
	request.ResultRef = "local://analysis/" + id + "/result.json"
	request.QuestionBankDraftRef = "local://question-bank-drafts/" + id + ".json"
	request.CompletedAt = createdAt.Add(time.Hour)
	request.UpdatedAt = request.CompletedAt
	return request
}
