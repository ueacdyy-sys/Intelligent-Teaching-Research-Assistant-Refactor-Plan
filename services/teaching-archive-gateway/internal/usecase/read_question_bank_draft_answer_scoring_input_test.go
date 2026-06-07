package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadQuestionBankDraftAnswerScoringInputReturnsWorkerInput(t *testing.T) {
	now := time.Date(2026, 6, 6, 10, 40, 0, 0, time.UTC)
	repo := &fakeQuestionBankDraftAnswerScoringInputRepository{
		request:    questionBankDraftAnswerScoringAIRequest(now),
		requestOK:  true,
		submission: questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001"),
		content:    questionBankDraftContentFixture(),
	}
	uc := usecase.NewReadQuestionBankDraftAnswerScoringInput(repo, fixedClock{now: now})

	got, err := uc.Execute(context.Background(), domain.ReadQuestionBankDraftAnswerScoringInputInput{
		Principal: servicePrincipal(),
		RequestID: " grading_req_qbank_answer ",
		WorkerID:  " worker_ai_grading_01 ",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if repo.requestID != "grading_req_qbank_answer" {
		t.Fatalf("requestID = %q", repo.requestID)
	}
	if repo.submissionID != "qbank_ans_sub_001" || repo.submissionStudentID != "student_001" {
		t.Fatalf("submission lookup = %q/%q", repo.submissionID, repo.submissionStudentID)
	}
	if repo.draftRef != "local://question-bank-drafts/tutor_req_001.json" || repo.contentStudentID != "student_001" {
		t.Fatalf("content lookup = %q/%q", repo.draftRef, repo.contentStudentID)
	}
	if len(got.Items) != 1 || got.Items[0].AnswerText != "3/4" || got.Items[0].ExpectedAnswer != "3/4" {
		t.Fatalf("input items = %#v", got.Items)
	}
}

func TestReadQuestionBankDraftAnswerScoringInputRejectsTeacherBeforeRepository(t *testing.T) {
	repo := &fakeQuestionBankDraftAnswerScoringInputRepository{
		request:   questionBankDraftAnswerScoringAIRequest(time.Now()),
		requestOK: true,
	}
	uc := usecase.NewReadQuestionBankDraftAnswerScoringInput(repo, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.ReadQuestionBankDraftAnswerScoringInputInput{
		Principal: teacherPrincipal(),
		RequestID: "grading_req_qbank_answer",
		WorkerID:  "worker_ai_grading_01",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.requestReads != 0 || repo.submissionReads != 0 || repo.contentReads != 0 {
		t.Fatalf("repo calls = %d/%d/%d, want 0/0/0", repo.requestReads, repo.submissionReads, repo.contentReads)
	}
}

func TestReadQuestionBankDraftAnswerScoringInputReturnsNotFoundForMissingRequest(t *testing.T) {
	repo := &fakeQuestionBankDraftAnswerScoringInputRepository{}
	uc := usecase.NewReadQuestionBankDraftAnswerScoringInput(repo, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.ReadQuestionBankDraftAnswerScoringInputInput{
		Principal: servicePrincipal(),
		RequestID: "grading_req_missing",
		WorkerID:  "worker_ai_grading_01",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
	if repo.requestReads != 1 || repo.submissionReads != 0 || repo.contentReads != 0 {
		t.Fatalf("repo calls = %d/%d/%d, want 1/0/0", repo.requestReads, repo.submissionReads, repo.contentReads)
	}
}

func TestReadQuestionBankDraftAnswerScoringInputRejectsWrongWorkerBeforeSourceReads(t *testing.T) {
	now := time.Date(2026, 6, 6, 10, 40, 0, 0, time.UTC)
	repo := &fakeQuestionBankDraftAnswerScoringInputRepository{
		request:   questionBankDraftAnswerScoringAIRequest(now),
		requestOK: true,
	}
	uc := usecase.NewReadQuestionBankDraftAnswerScoringInput(repo, fixedClock{now: now})

	_, err := uc.Execute(context.Background(), domain.ReadQuestionBankDraftAnswerScoringInputInput{
		Principal: servicePrincipal(),
		RequestID: "grading_req_qbank_answer",
		WorkerID:  "worker_other",
	})
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
	if repo.requestReads != 1 || repo.submissionReads != 0 || repo.contentReads != 0 {
		t.Fatalf("repo calls = %d/%d/%d, want 1/0/0", repo.requestReads, repo.submissionReads, repo.contentReads)
	}
}

func TestReadQuestionBankDraftAnswerScoringInputReturnsNotFoundForMissingSubmissionOrContent(t *testing.T) {
	now := time.Date(2026, 6, 6, 10, 40, 0, 0, time.UTC)
	repo := &fakeQuestionBankDraftAnswerScoringInputRepository{
		request:   questionBankDraftAnswerScoringAIRequest(now),
		requestOK: true,
		content:   questionBankDraftContentFixture(),
	}
	uc := usecase.NewReadQuestionBankDraftAnswerScoringInput(repo, fixedClock{now: now})

	_, err := uc.Execute(context.Background(), domain.ReadQuestionBankDraftAnswerScoringInputInput{
		Principal: servicePrincipal(),
		RequestID: "grading_req_qbank_answer",
		WorkerID:  "worker_ai_grading_01",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("missing submission error = %v, want ErrNotFound", err)
	}

	repo = &fakeQuestionBankDraftAnswerScoringInputRepository{
		request:    questionBankDraftAnswerScoringAIRequest(now),
		requestOK:  true,
		submission: questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001"),
	}
	uc = usecase.NewReadQuestionBankDraftAnswerScoringInput(repo, fixedClock{now: now})
	_, err = uc.Execute(context.Background(), domain.ReadQuestionBankDraftAnswerScoringInputInput{
		Principal: servicePrincipal(),
		RequestID: "grading_req_qbank_answer",
		WorkerID:  "worker_ai_grading_01",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("missing content error = %v, want ErrNotFound", err)
	}
}

type fakeQuestionBankDraftAnswerScoringInputRepository struct {
	request             domain.AIGradingRequest
	requestOK           bool
	submission          domain.QuestionBankDraftAnswerSubmission
	content             domain.QuestionBankDraftContent
	requestID           string
	submissionID        string
	submissionStudentID string
	draftRef            string
	contentStudentID    string
	requestReads        int
	submissionReads     int
	contentReads        int
}

func (f *fakeQuestionBankDraftAnswerScoringInputRepository) GetAIGradingRequestByID(
	_ context.Context,
	id string,
) (domain.AIGradingRequest, bool, error) {
	f.requestID = id
	f.requestReads++
	if f.request.ID != "" && f.request.ID != id {
		return domain.AIGradingRequest{}, false, nil
	}
	return f.request, f.requestOK, nil
}

func (f *fakeQuestionBankDraftAnswerScoringInputRepository) GetQuestionBankDraftAnswerSubmissionForStudent(
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

func (f *fakeQuestionBankDraftAnswerScoringInputRepository) GetQuestionBankDraftContentForStudent(
	_ context.Context,
	draftRef string,
	studentID string,
) (domain.QuestionBankDraftContent, bool, error) {
	f.draftRef = draftRef
	f.contentStudentID = studentID
	f.contentReads++
	if f.content.QuestionBankDraftRef == "" {
		return domain.QuestionBankDraftContent{}, false, nil
	}
	return f.content, f.content.QuestionBankDraftRef == draftRef && f.content.StudentID == studentID, nil
}

func questionBankDraftAnswerScoringAIRequest(now time.Time) domain.AIGradingRequest {
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
