package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeQuestionBankDraftAnswerScoringRequestAllowsOwnStudentSubmission(t *testing.T) {
	normalized, err := domain.NormalizeCreateStudentAppQuestionBankDraftAnswerScoringRequestInput(
		domain.CreateStudentAppQuestionBankDraftAnswerScoringRequestInput{
			Principal:           studentPrincipal("student_001"),
			SubmissionID:        " qbank_ans_sub_001 ",
			GradingInstructions: " score my answer ",
			RubricRef:           " local://rubrics/fractions.json ",
		},
	)
	if err != nil {
		t.Fatalf("Normalize returned error: %v", err)
	}
	if normalized.SubmissionID != "qbank_ans_sub_001" || normalized.StudentID != "student_001" {
		t.Fatalf("normalized scope = %#v", normalized)
	}
}

func TestNormalizeQuestionBankDraftAnswerScoringRequestRejectsTeacherAndRemote(t *testing.T) {
	for name, principal := range map[string]domain.PrincipalContext{
		"teacher": teacherPrincipal(),
		"remote":  remoteSocialPrincipal(),
		"service": servicePrincipal(),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeCreateStudentAppQuestionBankDraftAnswerScoringRequestInput(
				domain.CreateStudentAppQuestionBankDraftAnswerScoringRequestInput{
					Principal:           principal,
					SubmissionID:        "qbank_ans_sub_001",
					GradingInstructions: "score my answer",
				},
			)
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
		})
	}
}

func TestValidateQuestionBankDraftAnswerScoringSourceRejectsCrossStudentSubmission(t *testing.T) {
	input, err := domain.NormalizeCreateStudentAppQuestionBankDraftAnswerScoringRequestInput(
		domain.CreateStudentAppQuestionBankDraftAnswerScoringRequestInput{
			Principal:           studentPrincipal("student_001"),
			SubmissionID:        "qbank_ans_sub_001",
			GradingInstructions: "score my answer",
		},
	)
	if err != nil {
		t.Fatalf("Normalize returned error: %v", err)
	}
	submission := questionBankDraftAnswerSubmissionForScoring("qbank_ans_sub_001", "student_002")

	err = domain.ValidateQuestionBankDraftAnswerScoringSource(input, submission, questionBankDraftContentFixture())
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestNewAIGradingRequestQueuesQuestionBankAnswerSubmissionSourceRefs(t *testing.T) {
	request, err := domain.NewAIGradingRequest(
		"grading_req_qbank_answer",
		domain.CreateAIGradingRequestInput{
			Principal:                            studentPrincipal("student_001"),
			ArchiveItemID:                        "tarch_001",
			GradingInstructions:                  "score submitted question bank answers",
			SourceArchiveOwnerType:               domain.OwnerTypeStudent,
			SourceArchiveStudentID:               "student_001",
			SourceArchiveContentRef:              "local://question-bank-drafts/tutor_req_001.json",
			SourceQuestionBankDraftRef:           " local://question-bank-drafts/tutor_req_001.json ",
			SourceQuestionBankAnswerSubmissionID: " qbank_ans_sub_001 ",
			SourceArchiveMaterial:                domain.MaterialTypeQuiz,
			SourceArchiveOCRStatus:               domain.OCRStatusNotRequired,
			SourceAnalysisIntents:                []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
		},
		fixedTimeForQuestionBankScoring(),
	)
	if err != nil {
		t.Fatalf("NewAIGradingRequest returned error: %v", err)
	}
	if request.SourceQuestionBankDraftRef != "local://question-bank-drafts/tutor_req_001.json" {
		t.Fatalf("SourceQuestionBankDraftRef = %q", request.SourceQuestionBankDraftRef)
	}
	if request.SourceQuestionBankAnswerSubmissionID != "qbank_ans_sub_001" {
		t.Fatalf("SourceQuestionBankAnswerSubmissionID = %q", request.SourceQuestionBankAnswerSubmissionID)
	}
}

func TestNewAIGradingRequestRejectsPartialQuestionBankAnswerSubmissionSource(t *testing.T) {
	_, err := domain.NewAIGradingRequest(
		"grading_req_qbank_answer",
		domain.CreateAIGradingRequestInput{
			Principal:                            studentPrincipal("student_001"),
			ArchiveItemID:                        "tarch_001",
			GradingInstructions:                  "score submitted question bank answers",
			SourceArchiveOwnerType:               domain.OwnerTypeStudent,
			SourceArchiveStudentID:               "student_001",
			SourceArchiveContentRef:              "local://question-bank-drafts/tutor_req_001.json",
			SourceQuestionBankAnswerSubmissionID: "qbank_ans_sub_001",
			SourceArchiveMaterial:                domain.MaterialTypeQuiz,
			SourceArchiveOCRStatus:               domain.OCRStatusNotRequired,
		},
		fixedTimeForQuestionBankScoring(),
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
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
		SubmittedAt: fixedTimeForQuestionBankScoring(),
	}
}

func fixedTimeForQuestionBankScoring() time.Time {
	return time.Date(2026, 6, 6, 10, 0, 0, 0, time.UTC)
}
