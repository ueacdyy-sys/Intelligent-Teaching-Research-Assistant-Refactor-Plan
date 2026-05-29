package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestRecordAIGradingResultAllowsInternalService(t *testing.T) {
	request := aiGradingRequest("grading_req_claimed", "tarch_1", "student_001", time.Date(2026, 5, 30, 8, 0, 0, 0, time.UTC))
	request.Status = domain.AIGradingStatusInProgress
	request.ClaimedByWorkerID = "worker_ai_grading_01"
	request.ClaimExpiresAt = time.Date(2026, 5, 30, 9, 5, 0, 0, time.UTC)
	repo := &fakeAIGradingResultRepository{request: request, found: true}
	uc := usecase.NewRecordAIGradingResult(repo, fixedClock{now: time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)})

	got, err := uc.Execute(context.Background(), domain.RecordAIGradingResultInput{
		Principal:    servicePrincipal(),
		RequestID:    " grading_req_claimed ",
		WorkerID:     " worker_ai_grading_01 ",
		Status:       domain.AIGradingStatusSucceeded,
		ScoreSummary: " score 93 ",
		ResultRef:    "local://grading/grading_req_claimed/result.json",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if got.Status != domain.AIGradingStatusSucceeded {
		t.Fatalf("Status = %q", got.Status)
	}
	if got.ScoreSummary != "score 93" {
		t.Fatalf("ScoreSummary = %q", got.ScoreSummary)
	}
	if repo.updates != 1 {
		t.Fatalf("updates = %d", repo.updates)
	}
}

func TestRecordAIGradingResultRejectsTeacherBeforeRepository(t *testing.T) {
	repo := &fakeAIGradingResultRepository{found: true}
	uc := usecase.NewRecordAIGradingResult(repo, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.RecordAIGradingResultInput{
		Principal:    teacherPrincipal(),
		RequestID:    "grading_req_claimed",
		WorkerID:     "worker_ai_grading_01",
		Status:       domain.AIGradingStatusSucceeded,
		ScoreSummary: "summary",
		ResultRef:    "local://grading/grading_req_claimed/result.json",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.reads != 0 || repo.updates != 0 {
		t.Fatalf("repo reads=%d updates=%d", repo.reads, repo.updates)
	}
}

func TestRecordAIGradingResultRejectsFinalOverwrite(t *testing.T) {
	request := aiGradingRequest("grading_req_done", "tarch_1", "student_001", time.Date(2026, 5, 30, 8, 0, 0, 0, time.UTC))
	request.Status = domain.AIGradingStatusSucceeded
	repo := &fakeAIGradingResultRepository{request: request, found: true}
	uc := usecase.NewRecordAIGradingResult(repo, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.RecordAIGradingResultInput{
		Principal:    servicePrincipal(),
		RequestID:    "grading_req_done",
		WorkerID:     "worker_ai_grading_01",
		Status:       domain.AIGradingStatusSucceeded,
		ScoreSummary: "summary",
		ResultRef:    "local://grading/grading_req_done/result.json",
	})
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
	if repo.updates != 0 {
		t.Fatalf("updates = %d", repo.updates)
	}
}

type fakeAIGradingResultRepository struct {
	request domain.AIGradingRequest
	found   bool
	reads   int
	updates int
}

func (f *fakeAIGradingResultRepository) GetAIGradingRequestByID(
	_ context.Context,
	id string,
) (domain.AIGradingRequest, bool, error) {
	f.reads++
	if f.request.ID != "" && f.request.ID != id {
		return domain.AIGradingRequest{}, false, nil
	}
	return f.request, f.found, nil
}

func (f *fakeAIGradingResultRepository) RecordAIGradingResult(
	_ context.Context,
	request domain.AIGradingRequest,
) error {
	f.request = request
	f.updates++
	return nil
}
