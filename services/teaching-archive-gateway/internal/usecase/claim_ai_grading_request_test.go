package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestClaimAIGradingRequestAllowsInternalService(t *testing.T) {
	claimTime := time.Date(2026, 5, 29, 18, 0, 0, 0, time.UTC)
	repo := &fakeAIGradingClaimRepository{
		claimed: aiGradingRequest("grading_req_claim", "tarch_1", "student_001", claimTime.Add(-time.Hour)),
		found:   true,
	}
	uc := usecase.NewClaimAIGradingRequest(repo, fixedClock{now: claimTime})

	got, ok, err := uc.Execute(context.Background(), domain.ClaimAIGradingRequestInput{
		Principal:    servicePrincipal(),
		WorkerID:     " worker_ai_grading_01 ",
		LeaseSeconds: 120,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if !ok {
		t.Fatalf("Execute returned no claim")
	}
	if got.ID != "grading_req_claim" {
		t.Fatalf("ID = %q", got.ID)
	}
	if repo.claims != 1 {
		t.Fatalf("claims = %d", repo.claims)
	}
	if repo.input.WorkerID != "worker_ai_grading_01" {
		t.Fatalf("WorkerID = %q", repo.input.WorkerID)
	}
}

func TestClaimAIGradingRequestRejectsTeacherBeforeRepository(t *testing.T) {
	repo := &fakeAIGradingClaimRepository{found: true}
	uc := usecase.NewClaimAIGradingRequest(repo, fixedClock{})

	_, _, err := uc.Execute(context.Background(), domain.ClaimAIGradingRequestInput{
		Principal:    teacherPrincipal(),
		WorkerID:     "worker_ai_grading_01",
		LeaseSeconds: 120,
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.claims != 0 {
		t.Fatalf("claims = %d", repo.claims)
	}
}

func TestClaimAIGradingRequestEmptyQueueReturnsNoClaim(t *testing.T) {
	repo := &fakeAIGradingClaimRepository{}
	uc := usecase.NewClaimAIGradingRequest(repo, fixedClock{})

	_, ok, err := uc.Execute(context.Background(), domain.ClaimAIGradingRequestInput{
		Principal:    servicePrincipal(),
		WorkerID:     "worker_ai_grading_01",
		LeaseSeconds: 120,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if ok {
		t.Fatalf("Execute returned a claim for an empty queue")
	}
}

type fakeAIGradingClaimRepository struct {
	claimed domain.AIGradingRequest
	found   bool
	input   domain.ClaimAIGradingRequestInput
	now     time.Time
	claims  int
}

func (f *fakeAIGradingClaimRepository) ClaimNextAIGradingRequest(
	_ context.Context,
	input domain.ClaimAIGradingRequestInput,
	now time.Time,
) (domain.AIGradingRequest, bool, error) {
	f.input = input
	f.now = now
	f.claims++
	if !f.found {
		return domain.AIGradingRequest{}, false, nil
	}
	claimed, err := domain.ApplyAIGradingClaim(f.claimed, input, now)
	if err != nil {
		return domain.AIGradingRequest{}, false, err
	}
	return claimed, true, nil
}
