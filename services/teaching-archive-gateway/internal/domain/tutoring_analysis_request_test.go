package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNewTutoringAnalysisRequestNormalizesMetadata(t *testing.T) {
	request, err := domain.NewTutoringAnalysisRequest(
		"tutor_req_fixed",
		domain.CreateTutoringAnalysisRequestInput{
			Principal:              teacherPrincipal(),
			ArchiveItemID:          " tarch_item_001 ",
			AnalysisGoal:           "  detect weak algebra skills  ",
			QuestionBankIntent:     domain.QuestionBankIntentGeneratePersonalizedCheck,
			SourceArchiveOwnerType: domain.OwnerTypeStudent,
			SourceArchiveStudentID: " student_001 ",
			SourceArchiveMaterial:  domain.MaterialTypeQuiz,
		},
		time.Date(2026, 5, 29, 14, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("NewTutoringAnalysisRequest returned error: %v", err)
	}

	if request.ArchiveItemID != "tarch_item_001" {
		t.Fatalf("ArchiveItemID = %q", request.ArchiveItemID)
	}
	if request.AnalysisGoal != "detect weak algebra skills" {
		t.Fatalf("AnalysisGoal = %q", request.AnalysisGoal)
	}
	if request.Status != domain.TutoringAnalysisStatusQueued {
		t.Fatalf("Status = %q", request.Status)
	}
	if request.SourceArchiveStudentID != "student_001" {
		t.Fatalf("SourceArchiveStudentID = %q", request.SourceArchiveStudentID)
	}
}

func TestNormalizeListTutoringAnalysisRequestsInputDecodesCursor(t *testing.T) {
	cursor, err := domain.EncodeTutoringAnalysisRequestCursor(domain.TutoringAnalysisRequest{
		ID:        "tutor_req_cursor",
		CreatedAt: time.Date(2026, 5, 29, 14, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("EncodeTutoringAnalysisRequestCursor returned error: %v", err)
	}

	query, err := domain.NormalizeListTutoringAnalysisRequestsInput(domain.ListTutoringAnalysisRequestsInput{
		Status:                 domain.TutoringAnalysisStatusQueued,
		ArchiveItemID:          " tarch_item_001 ",
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		StudentID:              " student_001 ",
		PageSize:               25,
		Cursor:                 cursor,
	})
	if err != nil {
		t.Fatalf("NormalizeListTutoringAnalysisRequestsInput returned error: %v", err)
	}

	if query.ArchiveItemID != "tarch_item_001" {
		t.Fatalf("ArchiveItemID = %q", query.ArchiveItemID)
	}
	if query.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", query.StudentID)
	}
	if query.FetchLimit != 26 {
		t.Fatalf("FetchLimit = %d", query.FetchLimit)
	}
	if query.Cursor == nil || query.Cursor.ID != "tutor_req_cursor" {
		t.Fatalf("Cursor = %#v", query.Cursor)
	}
}

func TestBuildTutoringAnalysisRequestPageBuildsNextCursor(t *testing.T) {
	page, err := domain.BuildTutoringAnalysisRequestPage([]domain.TutoringAnalysisRequest{
		{ID: "tutor_req_2", CreatedAt: time.Date(2026, 5, 29, 14, 2, 0, 0, time.UTC)},
		{ID: "tutor_req_1", CreatedAt: time.Date(2026, 5, 29, 14, 1, 0, 0, time.UTC)},
	}, 1)
	if err != nil {
		t.Fatalf("BuildTutoringAnalysisRequestPage returned error: %v", err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("items = %d", len(page.Items))
	}
	if !page.PageInfo.HasMore || page.PageInfo.NextCursor == "" {
		t.Fatalf("pageInfo = %#v", page.PageInfo)
	}
}

func TestApplyTutoringAnalysisResultMarksSucceededMetadata(t *testing.T) {
	request := domain.TutoringAnalysisRequest{
		ID:                 "tutor_req_001",
		Status:             domain.TutoringAnalysisStatusInProgress,
		QuestionBankIntent: domain.QuestionBankIntentGeneratePersonalizedCheck,
		ClaimedByWorkerID:  "worker_teaching_ai_01",
		ClaimExpiresAt:     time.Date(2026, 5, 29, 15, 5, 0, 0, time.UTC),
		CreatedAt:          time.Date(2026, 5, 29, 14, 0, 0, 0, time.UTC),
	}

	updated, err := domain.ApplyTutoringAnalysisResult(
		request,
		domain.RecordTutoringAnalysisResultInput{
			Principal:            servicePrincipal(),
			RequestID:            " tutor_req_001 ",
			WorkerID:             " worker_teaching_ai_01 ",
			Status:               domain.TutoringAnalysisStatusSucceeded,
			ResultSummary:        "  mastered fractions  ",
			ResultRef:            " local://analysis/tutor_req_001/result.json ",
			QuestionBankDraftRef: " local://question-bank-drafts/tutor_req_001.json ",
		},
		time.Date(2026, 5, 29, 15, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("ApplyTutoringAnalysisResult returned error: %v", err)
	}

	if updated.Status != domain.TutoringAnalysisStatusSucceeded {
		t.Fatalf("Status = %q", updated.Status)
	}
	if updated.ResultSummary != "mastered fractions" {
		t.Fatalf("ResultSummary = %q", updated.ResultSummary)
	}
	if updated.QuestionBankDraftRef == "" {
		t.Fatalf("QuestionBankDraftRef missing")
	}
	if updated.CompletedAt.IsZero() || updated.UpdatedAt.IsZero() {
		t.Fatalf("timestamps missing: %#v", updated)
	}
}

func TestApplyTutoringAnalysisResultRejectsQueuedWithoutClaim(t *testing.T) {
	_, err := domain.ApplyTutoringAnalysisResult(
		domain.TutoringAnalysisRequest{ID: "tutor_req_001", Status: domain.TutoringAnalysisStatusQueued},
		domain.RecordTutoringAnalysisResultInput{
			Principal:     servicePrincipal(),
			RequestID:     "tutor_req_001",
			WorkerID:      "worker_teaching_ai_01",
			Status:        domain.TutoringAnalysisStatusSucceeded,
			ResultSummary: "summary",
			ResultRef:     "local://analysis/tutor_req_001/result.json",
		},
		time.Date(2026, 5, 29, 15, 0, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
}

func TestApplyTutoringAnalysisResultRejectsMismatchedWorker(t *testing.T) {
	_, err := domain.ApplyTutoringAnalysisResult(
		domain.TutoringAnalysisRequest{
			ID:                "tutor_req_001",
			Status:            domain.TutoringAnalysisStatusInProgress,
			ClaimedByWorkerID: "worker_owner",
			ClaimExpiresAt:    time.Date(2026, 5, 29, 15, 5, 0, 0, time.UTC),
		},
		domain.RecordTutoringAnalysisResultInput{
			Principal:     servicePrincipal(),
			RequestID:     "tutor_req_001",
			WorkerID:      "worker_other",
			Status:        domain.TutoringAnalysisStatusSucceeded,
			ResultSummary: "summary",
			ResultRef:     "local://analysis/tutor_req_001/result.json",
		},
		time.Date(2026, 5, 29, 15, 0, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
}

func TestApplyTutoringAnalysisResultRejectsExpiredLease(t *testing.T) {
	_, err := domain.ApplyTutoringAnalysisResult(
		domain.TutoringAnalysisRequest{
			ID:                "tutor_req_001",
			Status:            domain.TutoringAnalysisStatusInProgress,
			ClaimedByWorkerID: "worker_teaching_ai_01",
			ClaimExpiresAt:    time.Date(2026, 5, 29, 14, 59, 0, 0, time.UTC),
		},
		domain.RecordTutoringAnalysisResultInput{
			Principal:     servicePrincipal(),
			RequestID:     "tutor_req_001",
			WorkerID:      "worker_teaching_ai_01",
			Status:        domain.TutoringAnalysisStatusSucceeded,
			ResultSummary: "summary",
			ResultRef:     "local://analysis/tutor_req_001/result.json",
		},
		time.Date(2026, 5, 29, 15, 0, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
}

func TestApplyTutoringAnalysisResultRequiresFailureMessage(t *testing.T) {
	_, err := domain.ApplyTutoringAnalysisResult(
		domain.TutoringAnalysisRequest{
			ID:                "tutor_req_001",
			Status:            domain.TutoringAnalysisStatusInProgress,
			ClaimedByWorkerID: "worker_teaching_ai_01",
			ClaimExpiresAt:    time.Date(2026, 5, 29, 15, 5, 0, 0, time.UTC),
		},
		domain.RecordTutoringAnalysisResultInput{
			Principal: servicePrincipal(),
			RequestID: "tutor_req_001",
			WorkerID:  "worker_teaching_ai_01",
			Status:    domain.TutoringAnalysisStatusFailed,
		},
		time.Date(2026, 5, 29, 15, 0, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestApplyTutoringAnalysisResultRejectsErrorFieldsOnSuccess(t *testing.T) {
	_, err := domain.ApplyTutoringAnalysisResult(
		domain.TutoringAnalysisRequest{
			ID:                "tutor_req_001",
			Status:            domain.TutoringAnalysisStatusInProgress,
			ClaimedByWorkerID: "worker_teaching_ai_01",
			ClaimExpiresAt:    time.Date(2026, 5, 29, 15, 5, 0, 0, time.UTC),
		},
		domain.RecordTutoringAnalysisResultInput{
			Principal:     servicePrincipal(),
			RequestID:     "tutor_req_001",
			WorkerID:      "worker_teaching_ai_01",
			Status:        domain.TutoringAnalysisStatusSucceeded,
			ResultSummary: "summary",
			ResultRef:     "local://analysis/tutor_req_001/result.json",
			ErrorMessage:  "should not be accepted",
		},
		time.Date(2026, 5, 29, 15, 0, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestApplyTutoringAnalysisResultRejectsResultFieldsOnFailure(t *testing.T) {
	_, err := domain.ApplyTutoringAnalysisResult(
		domain.TutoringAnalysisRequest{
			ID:                "tutor_req_001",
			Status:            domain.TutoringAnalysisStatusInProgress,
			ClaimedByWorkerID: "worker_teaching_ai_01",
			ClaimExpiresAt:    time.Date(2026, 5, 29, 15, 5, 0, 0, time.UTC),
		},
		domain.RecordTutoringAnalysisResultInput{
			Principal:     servicePrincipal(),
			RequestID:     "tutor_req_001",
			WorkerID:      "worker_teaching_ai_01",
			Status:        domain.TutoringAnalysisStatusFailed,
			ResultSummary: "should not be accepted",
			ErrorMessage:  "worker failed",
		},
		time.Date(2026, 5, 29, 15, 0, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}
