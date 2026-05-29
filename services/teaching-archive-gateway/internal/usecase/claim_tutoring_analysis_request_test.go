package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestClaimTutoringAnalysisRequestAllowsInternalService(t *testing.T) {
	claimTime := time.Date(2026, 5, 29, 16, 0, 0, 0, time.UTC)
	repo := &fakeTutoringAnalysisClaimRepository{
		claimed: tutoringRequest("tutor_req_claim", "tarch_1", "student_001", claimTime.Add(-time.Hour)),
		found:   true,
	}
	uc := usecase.NewClaimTutoringAnalysisRequest(repo, fixedClock{now: claimTime})

	got, ok, err := uc.Execute(context.Background(), domain.ClaimTutoringAnalysisRequestInput{
		Principal:    servicePrincipal(),
		WorkerID:     " worker_teaching_ai_01 ",
		LeaseSeconds: 120,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if !ok {
		t.Fatalf("Execute returned no claim")
	}
	if got.ID != "tutor_req_claim" {
		t.Fatalf("ID = %q", got.ID)
	}
	if repo.claims != 1 {
		t.Fatalf("claims = %d", repo.claims)
	}
	if repo.input.WorkerID != "worker_teaching_ai_01" {
		t.Fatalf("WorkerID = %q", repo.input.WorkerID)
	}
}

func TestClaimTutoringAnalysisRequestRejectsTeacherBeforeRepository(t *testing.T) {
	repo := &fakeTutoringAnalysisClaimRepository{found: true}
	uc := usecase.NewClaimTutoringAnalysisRequest(repo, fixedClock{})

	_, _, err := uc.Execute(context.Background(), domain.ClaimTutoringAnalysisRequestInput{
		Principal:    teacherPrincipal(),
		WorkerID:     "worker_teaching_ai_01",
		LeaseSeconds: 120,
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.claims != 0 {
		t.Fatalf("claims = %d", repo.claims)
	}
}

func TestClaimTutoringAnalysisRequestEmptyQueueReturnsNoClaim(t *testing.T) {
	repo := &fakeTutoringAnalysisClaimRepository{}
	uc := usecase.NewClaimTutoringAnalysisRequest(repo, fixedClock{})

	_, ok, err := uc.Execute(context.Background(), domain.ClaimTutoringAnalysisRequestInput{
		Principal:    servicePrincipal(),
		WorkerID:     "worker_teaching_ai_01",
		LeaseSeconds: 120,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if ok {
		t.Fatalf("Execute returned a claim for an empty queue")
	}
}

type fakeTutoringAnalysisClaimRepository struct {
	claimed domain.TutoringAnalysisRequest
	found   bool
	input   domain.ClaimTutoringAnalysisRequestInput
	now     time.Time
	claims  int
}

func (f *fakeTutoringAnalysisClaimRepository) ClaimNextTutoringAnalysisRequest(
	_ context.Context,
	input domain.ClaimTutoringAnalysisRequestInput,
	now time.Time,
) (domain.TutoringAnalysisRequest, bool, error) {
	f.input = input
	f.now = now
	f.claims++
	if !f.found {
		return domain.TutoringAnalysisRequest{}, false, nil
	}
	claimed, err := domain.ApplyTutoringAnalysisClaim(f.claimed, input, now)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, false, err
	}
	return claimed, true, nil
}
