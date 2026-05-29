package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestRecordTutoringAnalysisResultAllowsInternalService(t *testing.T) {
	repo := &fakeTutoringAnalysisResultRepository{
		request: tutoringRequest("tutor_req_queued", "tarch_1", "student_001", time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC)),
		found:   true,
	}
	repo.request.QuestionBankIntent = domain.QuestionBankIntentGeneratePersonalizedCheck
	uc := usecase.NewRecordTutoringAnalysisResult(
		repo,
		fixedClock{now: time.Date(2026, 5, 29, 11, 0, 0, 0, time.UTC)},
	)

	got, err := uc.Execute(context.Background(), domain.RecordTutoringAnalysisResultInput{
		Principal:            servicePrincipal(),
		RequestID:            " tutor_req_queued ",
		Status:               domain.TutoringAnalysisStatusSucceeded,
		ResultSummary:        " mastered fractions, needs algebra practice ",
		ResultRef:            "local://analysis/tutor_req_queued/result.json",
		QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_queued.json",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if got.Status != domain.TutoringAnalysisStatusSucceeded {
		t.Fatalf("Status = %q", got.Status)
	}
	if got.ResultSummary != "mastered fractions, needs algebra practice" {
		t.Fatalf("ResultSummary = %q", got.ResultSummary)
	}
	if got.CompletedAt.IsZero() || got.UpdatedAt.IsZero() {
		t.Fatalf("completion timestamps missing: %#v", got)
	}
	if repo.updates != 1 {
		t.Fatalf("updates = %d", repo.updates)
	}
}

func TestRecordTutoringAnalysisResultRejectsTeacherPrincipalBeforeRepository(t *testing.T) {
	repo := &fakeTutoringAnalysisResultRepository{found: true}
	uc := usecase.NewRecordTutoringAnalysisResult(repo, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.RecordTutoringAnalysisResultInput{
		Principal:     teacherPrincipal(),
		RequestID:     "tutor_req_queued",
		Status:        domain.TutoringAnalysisStatusSucceeded,
		ResultSummary: "summary",
		ResultRef:     "local://analysis/tutor_req_queued/result.json",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.reads != 0 || repo.updates != 0 {
		t.Fatalf("repo reads=%d updates=%d", repo.reads, repo.updates)
	}
}

func TestRecordTutoringAnalysisResultRejectsFinalOverwrite(t *testing.T) {
	request := tutoringRequest("tutor_req_done", "tarch_1", "student_001", time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC))
	request.Status = domain.TutoringAnalysisStatusSucceeded
	repo := &fakeTutoringAnalysisResultRepository{request: request, found: true}
	uc := usecase.NewRecordTutoringAnalysisResult(repo, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.RecordTutoringAnalysisResultInput{
		Principal:    servicePrincipal(),
		RequestID:    "tutor_req_done",
		Status:       domain.TutoringAnalysisStatusFailed,
		ErrorMessage: "retry failed",
	})
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
	if repo.updates != 0 {
		t.Fatalf("updates = %d", repo.updates)
	}
}

type fakeTutoringAnalysisResultRepository struct {
	request domain.TutoringAnalysisRequest
	found   bool
	reads   int
	updates int
}

func (f *fakeTutoringAnalysisResultRepository) GetTutoringAnalysisRequestByID(
	_ context.Context,
	id string,
) (domain.TutoringAnalysisRequest, bool, error) {
	f.reads++
	if f.request.ID != "" && f.request.ID != id {
		return domain.TutoringAnalysisRequest{}, false, nil
	}
	return f.request, f.found, nil
}

func (f *fakeTutoringAnalysisResultRepository) RecordTutoringAnalysisResult(
	_ context.Context,
	request domain.TutoringAnalysisRequest,
) error {
	f.request = request
	f.updates++
	return nil
}
