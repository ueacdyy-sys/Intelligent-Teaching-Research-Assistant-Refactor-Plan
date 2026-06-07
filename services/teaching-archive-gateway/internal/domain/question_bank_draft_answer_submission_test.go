package domain_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeSubmitStudentAppQuestionBankDraftAnswerScopesOwnStudent(t *testing.T) {
	input, err := domain.NormalizeSubmitStudentAppQuestionBankDraftAnswerInput(
		domain.SubmitStudentAppQuestionBankDraftAnswerInput{
			Principal:            studentPrincipal("student_001"),
			QuestionBankDraftRef: " local://question-bank-drafts/tutor_req_001.json ",
			Answers: []domain.QuestionBankDraftSubmittedAnswer{
				{ItemID: " q_001 ", AnswerText: " 3/4 "},
			},
		},
	)
	if err != nil {
		t.Fatalf("NormalizeSubmitStudentAppQuestionBankDraftAnswerInput returned error: %v", err)
	}
	if input.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", input.StudentID)
	}
	if input.QuestionBankDraftRef != "local://question-bank-drafts/tutor_req_001.json" {
		t.Fatalf("QuestionBankDraftRef = %q", input.QuestionBankDraftRef)
	}
	if got := input.Answers[0].AnswerText; got != "3/4" {
		t.Fatalf("AnswerText = %q", got)
	}
}

func TestNormalizeSubmitStudentAppQuestionBankDraftAnswerRejectsUnsafeInput(t *testing.T) {
	_, badPrincipalErr := domain.NormalizeSubmitStudentAppQuestionBankDraftAnswerInput(
		domain.SubmitStudentAppQuestionBankDraftAnswerInput{
			Principal:            remoteSocialPrincipal(),
			QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_001.json",
			Answers: []domain.QuestionBankDraftSubmittedAnswer{
				{ItemID: "q_001", AnswerText: "3/4"},
			},
		},
	)
	if !errors.Is(badPrincipalErr, domain.ErrForbidden) {
		t.Fatalf("bad principal error = %v, want ErrForbidden", badPrincipalErr)
	}

	_, badRefErr := domain.NormalizeSubmitStudentAppQuestionBankDraftAnswerInput(
		domain.SubmitStudentAppQuestionBankDraftAnswerInput{
			Principal:            studentPrincipal("student_001"),
			QuestionBankDraftRef: "https://cdn.example.com/tutor_req_001.json",
			Answers: []domain.QuestionBankDraftSubmittedAnswer{
				{ItemID: "q_001", AnswerText: "3/4"},
			},
		},
	)
	if !errors.Is(badRefErr, domain.ErrValidation) {
		t.Fatalf("bad ref error = %v, want ErrValidation", badRefErr)
	}
}

func TestNormalizeSubmitStudentAppQuestionBankDraftAnswerRejectsDuplicateAndOversizeAnswers(t *testing.T) {
	_, duplicateErr := domain.NormalizeSubmitStudentAppQuestionBankDraftAnswerInput(
		domain.SubmitStudentAppQuestionBankDraftAnswerInput{
			Principal:            studentPrincipal("student_001"),
			QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_001.json",
			Answers: []domain.QuestionBankDraftSubmittedAnswer{
				{ItemID: "q_001", AnswerText: "3/4"},
				{ItemID: "q_001", AnswerText: "0.75"},
			},
		},
	)
	if !errors.Is(duplicateErr, domain.ErrValidation) {
		t.Fatalf("duplicate error = %v, want ErrValidation", duplicateErr)
	}

	_, oversizeErr := domain.NormalizeSubmitStudentAppQuestionBankDraftAnswerInput(
		domain.SubmitStudentAppQuestionBankDraftAnswerInput{
			Principal:            studentPrincipal("student_001"),
			QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_001.json",
			Answers: []domain.QuestionBankDraftSubmittedAnswer{
				{ItemID: "q_001", AnswerText: strings.Repeat("x", 4001)},
			},
		},
	)
	if !errors.Is(oversizeErr, domain.ErrValidation) {
		t.Fatalf("oversize error = %v, want ErrValidation", oversizeErr)
	}
}

func TestNewQuestionBankDraftAnswerSubmissionRejectsUnknownDraftItem(t *testing.T) {
	input, err := domain.NormalizeSubmitStudentAppQuestionBankDraftAnswerInput(
		domain.SubmitStudentAppQuestionBankDraftAnswerInput{
			Principal:            studentPrincipal("student_001"),
			QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_001.json",
			Answers: []domain.QuestionBankDraftSubmittedAnswer{
				{ItemID: "q_missing", AnswerText: "3/4"},
			},
		},
	)
	if err != nil {
		t.Fatalf("NormalizeSubmitStudentAppQuestionBankDraftAnswerInput returned error: %v", err)
	}

	_, err = domain.NewQuestionBankDraftAnswerSubmission(
		"qbank_ans_sub_001",
		input,
		questionBankDraftContentFixture(),
		time.Date(2026, 6, 6, 9, 30, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestNewQuestionBankDraftAnswerSubmissionBuildsSubmittedMetadata(t *testing.T) {
	input, err := domain.NormalizeSubmitStudentAppQuestionBankDraftAnswerInput(
		domain.SubmitStudentAppQuestionBankDraftAnswerInput{
			Principal:            studentPrincipal("student_001"),
			QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_001.json",
			Answers: []domain.QuestionBankDraftSubmittedAnswer{
				{ItemID: "q_001", AnswerText: "3/4"},
			},
		},
	)
	if err != nil {
		t.Fatalf("NormalizeSubmitStudentAppQuestionBankDraftAnswerInput returned error: %v", err)
	}

	submission, err := domain.NewQuestionBankDraftAnswerSubmission(
		"qbank_ans_sub_001",
		input,
		questionBankDraftContentFixture(),
		time.Date(2026, 6, 6, 9, 30, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("NewQuestionBankDraftAnswerSubmission returned error: %v", err)
	}
	if submission.StudentID != "student_001" || submission.ArchiveItemID != "tarch_001" {
		t.Fatalf("submission linkage = %#v", submission)
	}
	if submission.Status != domain.QuestionBankDraftAnswerSubmissionStatusSubmitted {
		t.Fatalf("Status = %q", submission.Status)
	}
	if len(submission.Answers) != 1 || submission.Answers[0].ItemID != "q_001" {
		t.Fatalf("Answers = %#v", submission.Answers)
	}
}
