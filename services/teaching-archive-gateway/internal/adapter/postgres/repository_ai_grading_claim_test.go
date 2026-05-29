package postgres_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestClaimNextAIGradingRequestUsesAtomicSkipLockedUpdate(t *testing.T) {
	db := &recordingDB{rows: &singleAIGradingRequestRow{
		status:              domain.AIGradingStatusInProgress,
		claimedByWorkerID:   "worker_ai_grading_01",
		claimExpiresAt:      time.Date(2026, 5, 29, 18, 5, 0, 0, time.UTC),
		claimExpiresAtValid: true,
	}}
	repository := postgres.NewArchiveRepository(db)

	request, ok, err := repository.ClaimNextAIGradingRequest(
		context.Background(),
		domain.ClaimAIGradingRequestInput{
			WorkerID:     "worker_ai_grading_01",
			LeaseSeconds: 300,
		},
		time.Date(2026, 5, 29, 18, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("ClaimNextAIGradingRequest returned error: %v", err)
	}
	if !ok {
		t.Fatalf("expected a claimed request")
	}
	if request.Status != domain.AIGradingStatusInProgress {
		t.Fatalf("Status = %q", request.Status)
	}

	for _, fragment := range []string{
		"UPDATE teaching_ai_grading_requests",
		"status = $1",
		"claimed_by_worker_id = $2",
		"claim_expires_at = $3",
		"WHERE status = $5",
		"OR (status = $6 AND claim_expires_at <= $4)",
		"ORDER BY created_at ASC, id ASC",
		"FOR UPDATE SKIP LOCKED",
		"RETURNING",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 6 {
		t.Fatalf("args = %d, want 6", len(db.args))
	}
}
