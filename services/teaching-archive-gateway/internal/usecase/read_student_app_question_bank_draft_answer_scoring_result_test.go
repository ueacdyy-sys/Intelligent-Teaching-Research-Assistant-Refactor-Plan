package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadStudentAppQuestionBankDraftAnswerScoringResultReturnsSafeOwnResult(t *testing.T) {
	now := time.Date(2026, 6, 6, 11, 0, 0, 0, time.UTC)
	repo := &fakeQuestionBankDraftAnswerScoringResultRepository{
		submission: questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001"),
		request:    succeededQuestionBankDraftAnswerScoringAIRequest(now),
	}
	uc := usecase.NewReadStudentAppQuestionBankDraftAnswerScoringResult(repo)

	got, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftAnswerScoringResultInput{
		Principal:    studentPrincipal("student_001"),
		SubmissionID: " qbank_ans_sub_001 ",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if repo.submissionID != "qbank_ans_sub_001" || repo.submissionStudentID != "student_001" {
		t.Fatalf("submission lookup = %q/%q", repo.submissionID, repo.submissionStudentID)
	}
	if repo.requestSubmissionID != "qbank_ans_sub_001" || repo.requestStudentID != "student_001" {
		t.Fatalf("request lookup = %q/%q", repo.requestSubmissionID, repo.requestStudentID)
	}
	if got.Status != domain.AIGradingStatusSucceeded || got.ScoreSummary != "score 93" {
		t.Fatalf("result = %#v", got)
	}
}

func TestReadStudentAppQuestionBankDraftAnswerScoringResultRejectsForbiddenBeforeRepository(t *testing.T) {
	repo := &fakeQuestionBankDraftAnswerScoringResultRepository{
		submission: questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001"),
		request:    succeededQuestionBankDraftAnswerScoringAIRequest(time.Now()),
	}
	uc := usecase.NewReadStudentAppQuestionBankDraftAnswerScoringResult(repo)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftAnswerScoringResultInput{
		Principal:    teacherPrincipal(),
		SubmissionID: "qbank_ans_sub_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.submissionReads != 0 || repo.requestReads != 0 {
		t.Fatalf("repo calls = %d/%d, want 0/0", repo.submissionReads, repo.requestReads)
	}
}

func TestReadStudentAppQuestionBankDraftAnswerScoringResultReturnsNotFoundForMissingSubmissionOrRequest(t *testing.T) {
	uc := usecase.NewReadStudentAppQuestionBankDraftAnswerScoringResult(
		&fakeQuestionBankDraftAnswerScoringResultRepository{},
	)
	_, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftAnswerScoringResultInput{
		Principal:    studentPrincipal("student_001"),
		SubmissionID: "qbank_ans_sub_missing",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("missing submission error = %v, want ErrNotFound", err)
	}

	repo := &fakeQuestionBankDraftAnswerScoringResultRepository{
		submission: questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001"),
	}
	uc = usecase.NewReadStudentAppQuestionBankDraftAnswerScoringResult(repo)
	_, err = uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftAnswerScoringResultInput{
		Principal:    studentPrincipal("student_001"),
		SubmissionID: "qbank_ans_sub_001",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("missing request error = %v, want ErrNotFound", err)
	}
}

func TestReadStudentAppQuestionBankDraftAnswerScoringResultRejectsBrokenRequestLinkage(t *testing.T) {
	now := time.Date(2026, 6, 6, 11, 0, 0, 0, time.UTC)
	request := succeededQuestionBankDraftAnswerScoringAIRequest(now)
	request.SourceQuestionBankAnswerSubmissionID = "qbank_ans_sub_other"
	repo := &fakeQuestionBankDraftAnswerScoringResultRepository{
		submission: questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001"),
		request:    request,
	}
	uc := usecase.NewReadStudentAppQuestionBankDraftAnswerScoringResult(repo)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftAnswerScoringResultInput{
		Principal:    studentPrincipal("student_001"),
		SubmissionID: "qbank_ans_sub_001",
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

type fakeQuestionBankDraftAnswerScoringResultRepository struct {
	submission          domain.QuestionBankDraftAnswerSubmission
	request             domain.AIGradingRequest
	submissionID        string
	submissionStudentID string
	requestSubmissionID string
	requestStudentID    string
	submissionReads     int
	requestReads        int
}

func (f *fakeQuestionBankDraftAnswerScoringResultRepository) GetQuestionBankDraftAnswerSubmissionForStudent(
	_ context.Context,
	submissionID string,
	studentID string,
) (domain.QuestionBankDraftAnswerSubmission, bool, error) {
	f.submissionID = submissionID
	f.submissionStudentID = studentID
	f.submissionReads++
	if f.submission.ID == "" {
		return domain.QuestionBankDraftAnswerSubmission{}, false, nil
	}
	return f.submission, f.submission.ID == submissionID && f.submission.StudentID == studentID, nil
}

func (f *fakeQuestionBankDraftAnswerScoringResultRepository) GetLatestQuestionBankDraftAnswerScoringRequestForStudent(
	_ context.Context,
	submissionID string,
	studentID string,
) (domain.AIGradingRequest, bool, error) {
	f.requestSubmissionID = submissionID
	f.requestStudentID = studentID
	f.requestReads++
	if f.request.ID == "" {
		return domain.AIGradingRequest{}, false, nil
	}
	return f.request, true, nil
}

func succeededQuestionBankDraftAnswerScoringAIRequest(now time.Time) domain.AIGradingRequest {
	request := questionBankDraftAnswerScoringAIRequest(now)
	request.Status = domain.AIGradingStatusSucceeded
	request.ScoreSummary = "score 93"
	request.ResultRef = "local://grading/grading_req_qbank_answer/result.json"
	request.CompletedAt = now.Add(time.Minute)
	request.UpdatedAt = request.CompletedAt
	return request
}
