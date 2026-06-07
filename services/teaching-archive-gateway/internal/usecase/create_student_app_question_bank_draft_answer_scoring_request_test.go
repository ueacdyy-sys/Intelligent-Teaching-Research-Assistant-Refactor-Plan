package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestCreateStudentAppQuestionBankDraftAnswerScoringRequestQueuesOwnSubmission(t *testing.T) {
	repo := &fakeQuestionBankDraftAnswerScoringRepository{
		content:    questionBankDraftContentFixture(),
		submission: questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001"),
	}
	uc := usecase.NewCreateStudentAppQuestionBankDraftAnswerScoringRequest(
		repo,
		fixedIDs{id: "grading_req_qbank_answer"},
		fixedClock{now: time.Date(2026, 6, 6, 10, 30, 0, 0, time.UTC)},
	)

	got, err := uc.Execute(context.Background(), domain.CreateStudentAppQuestionBankDraftAnswerScoringRequestInput{
		Principal:           studentPrincipal("student_001"),
		SubmissionID:        " qbank_ans_sub_001 ",
		GradingInstructions: " score my submitted answer ",
		RubricRef:           " local://rubrics/fractions.json ",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if repo.submissionID != "qbank_ans_sub_001" || repo.studentID != "student_001" {
		t.Fatalf("submission scoped lookup = %q/%q", repo.submissionID, repo.studentID)
	}
	if repo.draftRef != "local://question-bank-drafts/tutor_req_001.json" || repo.contentStudentID != "student_001" {
		t.Fatalf("content scoped lookup = %q/%q", repo.draftRef, repo.contentStudentID)
	}
	if repo.gradingCreates != 1 {
		t.Fatalf("gradingCreates = %d, want 1", repo.gradingCreates)
	}
	if got.SourceQuestionBankDraftRef != "local://question-bank-drafts/tutor_req_001.json" {
		t.Fatalf("SourceQuestionBankDraftRef = %q", got.SourceQuestionBankDraftRef)
	}
	if got.SourceQuestionBankAnswerSubmissionID != "qbank_ans_sub_001" {
		t.Fatalf("SourceQuestionBankAnswerSubmissionID = %q", got.SourceQuestionBankAnswerSubmissionID)
	}
	if got.ScoreSummary != "" || got.ResultRef != "" {
		t.Fatalf("queued request has result fields: %#v", got)
	}
}

func TestCreateStudentAppQuestionBankDraftAnswerScoringRequestRejectsForbiddenBeforeRead(t *testing.T) {
	repo := &fakeQuestionBankDraftAnswerScoringRepository{
		content:    questionBankDraftContentFixture(),
		submission: questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001"),
	}
	uc := usecase.NewCreateStudentAppQuestionBankDraftAnswerScoringRequest(repo, fixedIDs{id: "grading_req_qbank_answer"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateStudentAppQuestionBankDraftAnswerScoringRequestInput{
		Principal:           remotePrincipal(),
		SubmissionID:        "qbank_ans_sub_001",
		GradingInstructions: "score my answer",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.submissionReads != 0 || repo.contentReads != 0 || repo.gradingCreates != 0 {
		t.Fatalf("repo calls = %d/%d/%d, want 0/0/0", repo.submissionReads, repo.contentReads, repo.gradingCreates)
	}
}

func TestCreateStudentAppQuestionBankDraftAnswerScoringRequestReturnsNotFoundForMissingSubmission(t *testing.T) {
	repo := &fakeQuestionBankDraftAnswerScoringRepository{content: questionBankDraftContentFixture()}
	uc := usecase.NewCreateStudentAppQuestionBankDraftAnswerScoringRequest(repo, fixedIDs{id: "grading_req_qbank_answer"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateStudentAppQuestionBankDraftAnswerScoringRequestInput{
		Principal:           studentPrincipal("student_001"),
		SubmissionID:        "qbank_ans_sub_missing",
		GradingInstructions: "score my answer",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
	if repo.submissionReads != 1 || repo.contentReads != 0 || repo.gradingCreates != 0 {
		t.Fatalf("repo calls = %d/%d/%d, want 1/0/0", repo.submissionReads, repo.contentReads, repo.gradingCreates)
	}
}

func TestCreateStudentAppQuestionBankDraftAnswerScoringRequestRejectsBrokenSubmissionLinkage(t *testing.T) {
	submission := questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_001")
	submission.ArchiveItemID = "tarch_other"
	repo := &fakeQuestionBankDraftAnswerScoringRepository{
		content:    questionBankDraftContentFixture(),
		submission: submission,
	}
	uc := usecase.NewCreateStudentAppQuestionBankDraftAnswerScoringRequest(repo, fixedIDs{id: "grading_req_qbank_answer"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateStudentAppQuestionBankDraftAnswerScoringRequestInput{
		Principal:           studentPrincipal("student_001"),
		SubmissionID:        "qbank_ans_sub_001",
		GradingInstructions: "score my answer",
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
	if repo.gradingCreates != 0 {
		t.Fatalf("gradingCreates = %d, want 0", repo.gradingCreates)
	}
}

type fakeQuestionBankDraftAnswerScoringRepository struct {
	submission       domain.QuestionBankDraftAnswerSubmission
	content          domain.QuestionBankDraftContent
	submissionID     string
	studentID        string
	draftRef         string
	contentStudentID string
	createdGrading   domain.AIGradingRequest
	submissionReads  int
	contentReads     int
	gradingCreates   int
}

func (f *fakeQuestionBankDraftAnswerScoringRepository) GetQuestionBankDraftAnswerSubmissionForStudent(
	_ context.Context,
	submissionID string,
	studentID string,
) (domain.QuestionBankDraftAnswerSubmission, bool, error) {
	f.submissionID = submissionID
	f.studentID = studentID
	f.submissionReads++
	if f.submission.ID == "" {
		return domain.QuestionBankDraftAnswerSubmission{}, false, nil
	}
	if f.submission.ID != submissionID || f.submission.StudentID != studentID {
		return domain.QuestionBankDraftAnswerSubmission{}, false, nil
	}
	return f.submission, true, nil
}

func (f *fakeQuestionBankDraftAnswerScoringRepository) GetQuestionBankDraftContentForStudent(
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
	return f.content, true, nil
}

func (f *fakeQuestionBankDraftAnswerScoringRepository) CreateAIGradingRequest(
	_ context.Context,
	request domain.AIGradingRequest,
) error {
	f.createdGrading = request
	f.gradingCreates++
	return nil
}

func questionBankDraftAnswerSubmissionForScoring(id string, studentID string) domain.QuestionBankDraftAnswerSubmission {
	return domain.QuestionBankDraftAnswerSubmission{
		ID:                        id,
		QuestionBankDraftRef:      "local://question-bank-drafts/tutor_req_001.json",
		TutoringAnalysisRequestID: "tutor_req_001",
		ArchiveItemID:             "tarch_001",
		StudentID:                 studentID,
		SubmittedByPrincipalID:    studentID,
		Status:                    domain.QuestionBankDraftAnswerSubmissionStatusSubmitted,
		Answers: []domain.QuestionBankDraftSubmittedAnswer{
			{ItemID: "q_001", AnswerText: "3/4"},
		},
		SubmittedAt: time.Date(2026, 6, 6, 10, 0, 0, 0, time.UTC),
	}
}
