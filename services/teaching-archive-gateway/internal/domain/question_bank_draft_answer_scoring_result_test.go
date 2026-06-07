package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeQuestionBankDraftAnswerScoringResultScopesOwnStudentSubmission(t *testing.T) {
	normalized, err := domain.NormalizeReadStudentAppQuestionBankDraftAnswerScoringResultInput(
		domain.ReadStudentAppQuestionBankDraftAnswerScoringResultInput{
			Principal:    studentPrincipal("student_001"),
			SubmissionID: " qbank_ans_sub_001 ",
		},
	)
	if err != nil {
		t.Fatalf("Normalize returned error: %v", err)
	}
	if normalized.SubmissionID != "qbank_ans_sub_001" || normalized.StudentID != "student_001" {
		t.Fatalf("normalized = %#v", normalized)
	}
}

func TestNormalizeQuestionBankDraftAnswerScoringResultRejectsNonStudentAppPrincipals(t *testing.T) {
	for name, principal := range map[string]domain.PrincipalContext{
		"teacher": teacherPrincipal(),
		"remote":  remoteSocialPrincipal(),
		"service": servicePrincipal(),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeReadStudentAppQuestionBankDraftAnswerScoringResultInput(
				domain.ReadStudentAppQuestionBankDraftAnswerScoringResultInput{
					Principal:    principal,
					SubmissionID: "qbank_ans_sub_001",
				},
			)
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
		})
	}
}

func TestBuildQuestionBankDraftAnswerScoringResultReturnsSafeSucceededSummary(t *testing.T) {
	now := fixedTimeForQuestionBankScoring()
	input := normalizedScoringResultInput(t)
	request := succeededQuestionBankDraftAnswerScoringRequest(now)

	got, err := domain.BuildStudentAppQuestionBankDraftAnswerScoringResult(
		input,
		questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001"),
		request,
	)
	if err != nil {
		t.Fatalf("Build returned error: %v", err)
	}
	if got.SubmissionID != "qbank_ans_sub_001" || got.RequestID != "grading_req_qbank_answer" {
		t.Fatalf("ids = %#v", got)
	}
	if got.Status != domain.AIGradingStatusSucceeded || got.ScoreSummary != "score 93" {
		t.Fatalf("result = %#v", got)
	}
	if got.ErrorCode != "" || got.CompletedAt.IsZero() {
		t.Fatalf("terminal fields = %#v", got)
	}
}

func TestBuildQuestionBankDraftAnswerScoringResultHidesPendingAndFailedInternals(t *testing.T) {
	now := fixedTimeForQuestionBankScoring()
	input := normalizedScoringResultInput(t)
	submission := questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001")

	queued := questionBankDraftAnswerScoringInputRequest(now)
	queued.Status = domain.AIGradingStatusQueued
	queued.ClaimedByWorkerID = ""
	queued.ClaimExpiresAt = time.Time{}
	got, err := domain.BuildStudentAppQuestionBankDraftAnswerScoringResult(input, submission, queued)
	if err != nil {
		t.Fatalf("queued Build returned error: %v", err)
	}
	if got.Status != domain.AIGradingStatusQueued || got.ScoreSummary != "" || got.ErrorCode != "" || !got.CompletedAt.IsZero() {
		t.Fatalf("queued result = %#v", got)
	}

	failed := questionBankDraftAnswerScoringInputRequest(now)
	failed.Status = domain.AIGradingStatusFailed
	failed.ScoreSummary = ""
	failed.ResultRef = ""
	failed.ErrorCode = "MODEL_TIMEOUT"
	failed.ErrorMessage = "internal timeout detail"
	failed.CompletedAt = now.Add(time.Minute)
	got, err = domain.BuildStudentAppQuestionBankDraftAnswerScoringResult(input, submission, failed)
	if err != nil {
		t.Fatalf("failed Build returned error: %v", err)
	}
	if got.Status != domain.AIGradingStatusFailed || got.ErrorCode != "MODEL_TIMEOUT" || got.ScoreSummary != "" {
		t.Fatalf("failed result = %#v", got)
	}
}

func TestBuildQuestionBankDraftAnswerScoringResultRejectsBrokenLinkageAndIncompleteSuccess(t *testing.T) {
	now := fixedTimeForQuestionBankScoring()
	input := normalizedScoringResultInput(t)
	submission := questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001")
	request := succeededQuestionBankDraftAnswerScoringRequest(now)
	request.SourceArchiveStudentID = "student_002"

	_, err := domain.BuildStudentAppQuestionBankDraftAnswerScoringResult(input, submission, request)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("broken linkage error = %v, want ErrValidation", err)
	}

	request = succeededQuestionBankDraftAnswerScoringRequest(now)
	request.ResultRef = ""
	_, err = domain.BuildStudentAppQuestionBankDraftAnswerScoringResult(input, submission, request)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("incomplete success error = %v, want ErrValidation", err)
	}
}

func normalizedScoringResultInput(
	t *testing.T,
) domain.NormalizedReadStudentAppQuestionBankDraftAnswerScoringResultInput {
	t.Helper()
	input, err := domain.NormalizeReadStudentAppQuestionBankDraftAnswerScoringResultInput(
		domain.ReadStudentAppQuestionBankDraftAnswerScoringResultInput{
			Principal:    studentPrincipal("student_001"),
			SubmissionID: "qbank_ans_sub_001",
		},
	)
	if err != nil {
		t.Fatalf("Normalize returned error: %v", err)
	}
	return input
}

func succeededQuestionBankDraftAnswerScoringRequest(now time.Time) domain.AIGradingRequest {
	request := questionBankDraftAnswerScoringInputRequest(now)
	request.Status = domain.AIGradingStatusSucceeded
	request.ScoreSummary = "score 93"
	request.ResultRef = "local://grading/grading_req_qbank_answer/result.json"
	request.CompletedAt = now.Add(time.Minute)
	request.UpdatedAt = request.CompletedAt
	return request
}
