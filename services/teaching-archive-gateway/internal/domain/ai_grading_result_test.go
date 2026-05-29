package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestApplyAIGradingResultMarksSucceededMetadata(t *testing.T) {
	completedAt := time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)

	updated, err := domain.ApplyAIGradingResult(
		domain.AIGradingRequest{
			ID:                "grading_req_001",
			Status:            domain.AIGradingStatusInProgress,
			ClaimedByWorkerID: "worker_ai_grading_01",
			ClaimExpiresAt:    completedAt.Add(5 * time.Minute),
			CreatedAt:         completedAt.Add(-time.Hour),
		},
		domain.RecordAIGradingResultInput{
			Principal:    servicePrincipal(),
			RequestID:    " grading_req_001 ",
			WorkerID:     " worker_ai_grading_01 ",
			Status:       domain.AIGradingStatusSucceeded,
			ScoreSummary: "  score 93, handwriting confidence reserved  ",
			ResultRef:    " local://grading/grading_req_001/result.json ",
		},
		completedAt,
	)
	if err != nil {
		t.Fatalf("ApplyAIGradingResult returned error: %v", err)
	}

	if updated.Status != domain.AIGradingStatusSucceeded {
		t.Fatalf("Status = %q", updated.Status)
	}
	if updated.ScoreSummary != "score 93, handwriting confidence reserved" {
		t.Fatalf("ScoreSummary = %q", updated.ScoreSummary)
	}
	if updated.ResultRef != "local://grading/grading_req_001/result.json" {
		t.Fatalf("ResultRef = %q", updated.ResultRef)
	}
	if updated.CompletedAt.IsZero() || updated.UpdatedAt.IsZero() {
		t.Fatalf("timestamps missing: %#v", updated)
	}
}

func TestApplyAIGradingResultRejectsExpiredLease(t *testing.T) {
	_, err := domain.ApplyAIGradingResult(
		domain.AIGradingRequest{
			ID:                "grading_req_001",
			Status:            domain.AIGradingStatusInProgress,
			ClaimedByWorkerID: "worker_ai_grading_01",
			ClaimExpiresAt:    time.Date(2026, 5, 30, 8, 59, 0, 0, time.UTC),
		},
		domain.RecordAIGradingResultInput{
			Principal:    servicePrincipal(),
			RequestID:    "grading_req_001",
			WorkerID:     "worker_ai_grading_01",
			Status:       domain.AIGradingStatusSucceeded,
			ScoreSummary: "summary",
			ResultRef:    "local://grading/grading_req_001/result.json",
		},
		time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
}

func TestApplyAIGradingResultRejectsMismatchedWorker(t *testing.T) {
	_, err := domain.ApplyAIGradingResult(
		domain.AIGradingRequest{
			ID:                "grading_req_001",
			Status:            domain.AIGradingStatusInProgress,
			ClaimedByWorkerID: "worker_owner",
			ClaimExpiresAt:    time.Date(2026, 5, 30, 9, 5, 0, 0, time.UTC),
		},
		domain.RecordAIGradingResultInput{
			Principal:    servicePrincipal(),
			RequestID:    "grading_req_001",
			WorkerID:     "worker_other",
			Status:       domain.AIGradingStatusSucceeded,
			ScoreSummary: "summary",
			ResultRef:    "local://grading/grading_req_001/result.json",
		},
		time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
}

func TestApplyAIGradingResultRequiresFailureMessage(t *testing.T) {
	_, err := domain.ApplyAIGradingResult(
		domain.AIGradingRequest{
			ID:                "grading_req_001",
			Status:            domain.AIGradingStatusInProgress,
			ClaimedByWorkerID: "worker_ai_grading_01",
			ClaimExpiresAt:    time.Date(2026, 5, 30, 9, 5, 0, 0, time.UTC),
		},
		domain.RecordAIGradingResultInput{
			Principal: servicePrincipal(),
			RequestID: "grading_req_001",
			WorkerID:  "worker_ai_grading_01",
			Status:    domain.AIGradingStatusFailed,
		},
		time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}
