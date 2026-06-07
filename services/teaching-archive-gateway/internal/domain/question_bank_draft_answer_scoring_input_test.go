package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestBuildQuestionBankDraftAnswerScoringInputReturnsWorkerOnlyAnswerPackage(t *testing.T) {
	now := fixedTimeForQuestionBankScoring()
	request := questionBankDraftAnswerScoringInputRequest(now)

	normalized, err := domain.NormalizeReadQuestionBankDraftAnswerScoringInputInput(
		domain.ReadQuestionBankDraftAnswerScoringInputInput{
			Principal: servicePrincipal(),
			RequestID: " grading_req_qbank_answer ",
			WorkerID:  " worker_ai_grading_01 ",
		},
	)
	if err != nil {
		t.Fatalf("Normalize returned error: %v", err)
	}
	got, err := domain.BuildQuestionBankDraftAnswerScoringInput(
		normalized,
		request,
		questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001"),
		questionBankDraftContentFixture(),
		now,
	)
	if err != nil {
		t.Fatalf("Build returned error: %v", err)
	}

	if got.RequestID != "grading_req_qbank_answer" || got.WorkerID != "worker_ai_grading_01" {
		t.Fatalf("request/worker = %q/%q", got.RequestID, got.WorkerID)
	}
	if got.SourceQuestionBankAnswerSubmissionID != "qbank_ans_sub_001" {
		t.Fatalf("submission source = %q", got.SourceQuestionBankAnswerSubmissionID)
	}
	if len(got.Items) != 1 {
		t.Fatalf("items = %d, want 1", len(got.Items))
	}
	item := got.Items[0]
	if item.AnswerText != "3/4" || item.ExpectedAnswer != "3/4" || item.Explanation != "Use a common denominator of 4." {
		t.Fatalf("item = %#v", item)
	}
}

func TestNormalizeQuestionBankDraftAnswerScoringInputRejectsNonServicePrincipals(t *testing.T) {
	for name, principal := range map[string]domain.PrincipalContext{
		"teacher": teacherPrincipal(),
		"student": studentPrincipal("student_001"),
		"remote":  remoteSocialPrincipal(),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeReadQuestionBankDraftAnswerScoringInputInput(
				domain.ReadQuestionBankDraftAnswerScoringInputInput{
					Principal: principal,
					RequestID: "grading_req_qbank_answer",
					WorkerID:  "worker_ai_grading_01",
				},
			)
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
		})
	}
}

func TestBuildQuestionBankDraftAnswerScoringInputRejectsExpiredLeaseAndWrongWorker(t *testing.T) {
	now := fixedTimeForQuestionBankScoring()
	normalized, err := domain.NormalizeReadQuestionBankDraftAnswerScoringInputInput(
		domain.ReadQuestionBankDraftAnswerScoringInputInput{
			Principal: servicePrincipal(),
			RequestID: "grading_req_qbank_answer",
			WorkerID:  "worker_ai_grading_01",
		},
	)
	if err != nil {
		t.Fatalf("Normalize returned error: %v", err)
	}
	request := questionBankDraftAnswerScoringInputRequest(now)
	request.ClaimExpiresAt = now.Add(-time.Second)

	_, err = domain.BuildQuestionBankDraftAnswerScoringInput(
		normalized,
		request,
		questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001"),
		questionBankDraftContentFixture(),
		now,
	)
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("expired lease error = %v, want ErrConflict", err)
	}

	request = questionBankDraftAnswerScoringInputRequest(now)
	request.ClaimedByWorkerID = "worker_other"
	_, err = domain.BuildQuestionBankDraftAnswerScoringInput(
		normalized,
		request,
		questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001"),
		questionBankDraftContentFixture(),
		now,
	)
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("wrong worker error = %v, want ErrConflict", err)
	}
}

func TestBuildQuestionBankDraftAnswerScoringInputRejectsNonQuestionBankSourceAndBrokenLinkage(t *testing.T) {
	now := fixedTimeForQuestionBankScoring()
	normalized, err := domain.NormalizeReadQuestionBankDraftAnswerScoringInputInput(
		domain.ReadQuestionBankDraftAnswerScoringInputInput{
			Principal: servicePrincipal(),
			RequestID: "grading_req_qbank_answer",
			WorkerID:  "worker_ai_grading_01",
		},
	)
	if err != nil {
		t.Fatalf("Normalize returned error: %v", err)
	}
	request := questionBankDraftAnswerScoringInputRequest(now)
	request.SourceQuestionBankAnswerSubmissionID = ""

	_, err = domain.BuildQuestionBankDraftAnswerScoringInput(
		normalized,
		request,
		questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001"),
		questionBankDraftContentFixture(),
		now,
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("non question-bank source error = %v, want ErrValidation", err)
	}

	request = questionBankDraftAnswerScoringInputRequest(now)
	submission := questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001")
	submission.ArchiveItemID = "tarch_other"
	_, err = domain.BuildQuestionBankDraftAnswerScoringInput(
		normalized,
		request,
		submission,
		questionBankDraftContentFixture(),
		now,
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("broken submission linkage error = %v, want ErrValidation", err)
	}
}

func questionBankDraftAnswerScoringInputRequest(now time.Time) domain.AIGradingRequest {
	return domain.AIGradingRequest{
		ID:                                   "grading_req_qbank_answer",
		ArchiveItemID:                        "tarch_001",
		RequestedByPrincipalID:               "student_001",
		GradingInstructions:                  "score submitted question bank answers",
		RubricRef:                            "local://rubrics/fractions.json",
		Status:                               domain.AIGradingStatusInProgress,
		SourceArchiveOwnerType:               domain.OwnerTypeStudent,
		SourceArchiveStudentID:               "student_001",
		SourceArchiveContentRef:              "local://question-bank-drafts/tutor_req_001.json",
		SourceQuestionBankDraftRef:           "local://question-bank-drafts/tutor_req_001.json",
		SourceQuestionBankAnswerSubmissionID: "qbank_ans_sub_001",
		SourceArchiveMaterial:                domain.MaterialTypeQuiz,
		SourceArchiveOCRStatus:               domain.OCRStatusNotRequired,
		ClaimedByWorkerID:                    "worker_ai_grading_01",
		ClaimExpiresAt:                       now.Add(time.Minute),
		CreatedAt:                            now.Add(-time.Hour),
		UpdatedAt:                            now,
	}
}
