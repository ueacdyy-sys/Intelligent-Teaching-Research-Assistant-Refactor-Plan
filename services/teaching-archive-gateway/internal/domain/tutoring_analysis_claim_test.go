package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestApplyTutoringAnalysisClaimMarksQueuedRequestInProgress(t *testing.T) {
	claimedAt := time.Date(2026, 5, 29, 16, 0, 0, 0, time.UTC)

	updated, err := domain.ApplyTutoringAnalysisClaim(
		domain.TutoringAnalysisRequest{
			ID:        "tutor_req_001",
			Status:    domain.TutoringAnalysisStatusQueued,
			CreatedAt: claimedAt.Add(-time.Hour),
		},
		domain.ClaimTutoringAnalysisRequestInput{
			Principal:    servicePrincipal(),
			WorkerID:     "  worker_teaching_ai_01  ",
			LeaseSeconds: 300,
		},
		claimedAt,
	)
	if err != nil {
		t.Fatalf("ApplyTutoringAnalysisClaim returned error: %v", err)
	}

	if updated.Status != domain.TutoringAnalysisStatusInProgress {
		t.Fatalf("Status = %q", updated.Status)
	}
	if updated.ClaimedByWorkerID != "worker_teaching_ai_01" {
		t.Fatalf("ClaimedByWorkerID = %q", updated.ClaimedByWorkerID)
	}
	if !updated.ClaimExpiresAt.Equal(claimedAt.Add(5 * time.Minute)) {
		t.Fatalf("ClaimExpiresAt = %s", updated.ClaimExpiresAt)
	}
	if !updated.UpdatedAt.Equal(claimedAt) {
		t.Fatalf("UpdatedAt = %s", updated.UpdatedAt)
	}
}

func TestApplyTutoringAnalysisClaimRejectsFinalRequest(t *testing.T) {
	_, err := domain.ApplyTutoringAnalysisClaim(
		domain.TutoringAnalysisRequest{
			ID:     "tutor_req_001",
			Status: domain.TutoringAnalysisStatusSucceeded,
		},
		domain.ClaimTutoringAnalysisRequestInput{
			Principal:    servicePrincipal(),
			WorkerID:     "worker_teaching_ai_01",
			LeaseSeconds: 300,
		},
		time.Date(2026, 5, 29, 16, 0, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
}

func TestApplyTutoringAnalysisClaimReclaimsExpiredLease(t *testing.T) {
	claimedAt := time.Date(2026, 5, 29, 16, 0, 0, 0, time.UTC)

	updated, err := domain.ApplyTutoringAnalysisClaim(
		domain.TutoringAnalysisRequest{
			ID:                "tutor_req_001",
			Status:            domain.TutoringAnalysisStatusInProgress,
			ClaimedByWorkerID: "worker_stale",
			ClaimExpiresAt:    claimedAt.Add(-time.Minute),
		},
		domain.ClaimTutoringAnalysisRequestInput{
			Principal:    servicePrincipal(),
			WorkerID:     "worker_fresh",
			LeaseSeconds: 300,
		},
		claimedAt,
	)
	if err != nil {
		t.Fatalf("ApplyTutoringAnalysisClaim returned error: %v", err)
	}
	if updated.ClaimedByWorkerID != "worker_fresh" {
		t.Fatalf("ClaimedByWorkerID = %q", updated.ClaimedByWorkerID)
	}
}

func TestApplyTutoringAnalysisClaimRejectsActiveLease(t *testing.T) {
	claimedAt := time.Date(2026, 5, 29, 16, 0, 0, 0, time.UTC)

	_, err := domain.ApplyTutoringAnalysisClaim(
		domain.TutoringAnalysisRequest{
			ID:                "tutor_req_001",
			Status:            domain.TutoringAnalysisStatusInProgress,
			ClaimedByWorkerID: "worker_active",
			ClaimExpiresAt:    claimedAt.Add(time.Minute),
		},
		domain.ClaimTutoringAnalysisRequestInput{
			Principal:    servicePrincipal(),
			WorkerID:     "worker_fresh",
			LeaseSeconds: 300,
		},
		claimedAt,
	)
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
}
