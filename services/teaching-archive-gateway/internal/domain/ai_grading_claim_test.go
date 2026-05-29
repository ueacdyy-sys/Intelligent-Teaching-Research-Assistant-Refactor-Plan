package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestApplyAIGradingClaimMarksQueuedRequestInProgress(t *testing.T) {
	claimedAt := time.Date(2026, 5, 29, 18, 0, 0, 0, time.UTC)

	updated, err := domain.ApplyAIGradingClaim(
		domain.AIGradingRequest{
			ID:        "grading_req_001",
			Status:    domain.AIGradingStatusQueued,
			CreatedAt: claimedAt.Add(-time.Hour),
		},
		domain.ClaimAIGradingRequestInput{
			Principal:    servicePrincipal(),
			WorkerID:     "  worker_ai_grading_01  ",
			LeaseSeconds: 300,
		},
		claimedAt,
	)
	if err != nil {
		t.Fatalf("ApplyAIGradingClaim returned error: %v", err)
	}

	if updated.Status != domain.AIGradingStatusInProgress {
		t.Fatalf("Status = %q", updated.Status)
	}
	if updated.ClaimedByWorkerID != "worker_ai_grading_01" {
		t.Fatalf("ClaimedByWorkerID = %q", updated.ClaimedByWorkerID)
	}
	if !updated.ClaimExpiresAt.Equal(claimedAt.Add(5 * time.Minute)) {
		t.Fatalf("ClaimExpiresAt = %s", updated.ClaimExpiresAt)
	}
	if !updated.UpdatedAt.Equal(claimedAt) {
		t.Fatalf("UpdatedAt = %s", updated.UpdatedAt)
	}
}

func TestApplyAIGradingClaimReclaimsExpiredLease(t *testing.T) {
	claimedAt := time.Date(2026, 5, 29, 18, 0, 0, 0, time.UTC)

	updated, err := domain.ApplyAIGradingClaim(
		domain.AIGradingRequest{
			ID:                "grading_req_001",
			Status:            domain.AIGradingStatusInProgress,
			ClaimedByWorkerID: "worker_stale",
			ClaimExpiresAt:    claimedAt.Add(-time.Minute),
		},
		domain.ClaimAIGradingRequestInput{
			Principal:    servicePrincipal(),
			WorkerID:     "worker_fresh",
			LeaseSeconds: 300,
		},
		claimedAt,
	)
	if err != nil {
		t.Fatalf("ApplyAIGradingClaim returned error: %v", err)
	}
	if updated.ClaimedByWorkerID != "worker_fresh" {
		t.Fatalf("ClaimedByWorkerID = %q", updated.ClaimedByWorkerID)
	}
}

func TestApplyAIGradingClaimRejectsActiveLease(t *testing.T) {
	claimedAt := time.Date(2026, 5, 29, 18, 0, 0, 0, time.UTC)

	_, err := domain.ApplyAIGradingClaim(
		domain.AIGradingRequest{
			ID:                "grading_req_001",
			Status:            domain.AIGradingStatusInProgress,
			ClaimedByWorkerID: "worker_active",
			ClaimExpiresAt:    claimedAt.Add(time.Minute),
		},
		domain.ClaimAIGradingRequestInput{
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
