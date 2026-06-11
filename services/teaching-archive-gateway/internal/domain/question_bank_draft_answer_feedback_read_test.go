package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeQuestionBankDraftAnswerFeedbackScopesOwnStudentSubmission(t *testing.T) {
	normalized, err := domain.NormalizeReadStudentAppQuestionBankDraftAnswerFeedbackInput(
		domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput{
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

func TestNormalizeQuestionBankDraftAnswerFeedbackRejectsNonStudentAppPrincipals(t *testing.T) {
	for name, principal := range map[string]domain.PrincipalContext{
		"teacher": teacherPrincipal(),
		"remote":  remoteSocialPrincipal(),
		"service": servicePrincipal(),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeReadStudentAppQuestionBankDraftAnswerFeedbackInput(
				domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput{
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

func TestBuildQuestionBankDraftAnswerFeedbackReturnsSafeReviewedCard(t *testing.T) {
	input := normalizedFeedbackInput(t)
	card, err := domain.BuildStudentAppQuestionBankDraftAnswerFeedbackCard(
		input,
		questionBankDraftAnswerSubmissionForFeedback("qbank_ans_sub_001", "student_001"),
		questionBankDraftAnswerFeedbackArchiveItem("tarch_student_feedback_001", "student_001"),
		questionBankDraftAnswerFeedbackSnapshot("tarch_student_feedback_001", "qbank_ans_sub_001", "student_001"),
	)
	if err != nil {
		t.Fatalf("Build returned error: %v", err)
	}
	if card.Status != domain.StudentAppQuestionBankDraftAnswerFeedbackStatusReady ||
		card.SubmissionID != "qbank_ans_sub_001" ||
		card.RequestID != "grading_req_qbank_answer_feedback_001" ||
		card.ArchiveItemID != "tarch_source_homework_001" ||
		card.FeedbackArchiveItemID != "tarch_student_feedback_001" ||
		card.ScoreSummary != "score 93" ||
		card.LearnerFeedback.Summary == "" ||
		len(card.LearnerFeedback.NextSteps) != 2 {
		t.Fatalf("card = %#v", card)
	}
}

func TestBuildQuestionBankDraftAnswerFeedbackRejectsBrokenLineageArchiveShapeAndUnsafeText(t *testing.T) {
	input := normalizedFeedbackInput(t)
	submission := questionBankDraftAnswerSubmissionForFeedback("qbank_ans_sub_001", "student_001")

	t.Run("cross student submission", func(t *testing.T) {
		_, err := domain.BuildStudentAppQuestionBankDraftAnswerFeedbackCard(
			input,
			questionBankDraftAnswerSubmissionForFeedback("qbank_ans_sub_001", "student_002"),
			questionBankDraftAnswerFeedbackArchiveItem("tarch_student_feedback_001", "student_001"),
			questionBankDraftAnswerFeedbackSnapshot("tarch_student_feedback_001", "qbank_ans_sub_001", "student_001"),
		)
		if !errors.Is(err, domain.ErrForbidden) {
			t.Fatalf("error = %v, want ErrForbidden", err)
		}
	})

	t.Run("wrong physical row shape", func(t *testing.T) {
		item := questionBankDraftAnswerFeedbackArchiveItem("tarch_student_feedback_001", "student_001")
		item.ContentRef = "local://unsafe/raw-feedback.json"
		_, err := domain.BuildStudentAppQuestionBankDraftAnswerFeedbackCard(
			input,
			submission,
			item,
			questionBankDraftAnswerFeedbackSnapshot("tarch_student_feedback_001", "qbank_ans_sub_001", "student_001"),
		)
		if !errors.Is(err, domain.ErrForbidden) {
			t.Fatalf("error = %v, want ErrForbidden", err)
		}
	})

	t.Run("unsafe feedback", func(t *testing.T) {
		snapshot := questionBankDraftAnswerFeedbackSnapshot("tarch_student_feedback_001", "qbank_ans_sub_001", "student_001")
		snapshot.LearnerFeedback.Summary = "<script>alert(1)</script>"
		_, err := domain.BuildStudentAppQuestionBankDraftAnswerFeedbackCard(
			input,
			submission,
			questionBankDraftAnswerFeedbackArchiveItem("tarch_student_feedback_001", "student_001"),
			snapshot,
		)
		if !errors.Is(err, domain.ErrValidation) {
			t.Fatalf("error = %v, want ErrValidation", err)
		}
	})
}

func normalizedFeedbackInput(
	t *testing.T,
) domain.NormalizedReadStudentAppQuestionBankDraftAnswerFeedbackInput {
	t.Helper()
	input, err := domain.NormalizeReadStudentAppQuestionBankDraftAnswerFeedbackInput(
		domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput{
			Principal:    studentPrincipal("student_001"),
			SubmissionID: "qbank_ans_sub_001",
		},
	)
	if err != nil {
		t.Fatalf("Normalize returned error: %v", err)
	}
	return input
}

func questionBankDraftAnswerSubmissionForFeedback(
	id string,
	studentID string,
) domain.QuestionBankDraftAnswerSubmission {
	return domain.QuestionBankDraftAnswerSubmission{
		ID:                        id,
		QuestionBankDraftRef:      "local://question-bank-drafts/tutor_req_feedback_001.json",
		TutoringAnalysisRequestID: "tutor_req_feedback_001",
		ArchiveItemID:             "tarch_source_homework_001",
		StudentID:                 studentID,
		SubmittedByPrincipalID:    studentID,
		Status:                    domain.QuestionBankDraftAnswerSubmissionStatusSubmitted,
		Answers: []domain.QuestionBankDraftSubmittedAnswer{
			{ItemID: "q_001", AnswerText: "3/4"},
		},
		SubmittedAt: time.Date(2026, 6, 6, 9, 32, 0, 0, time.UTC),
	}
}

func questionBankDraftAnswerFeedbackArchiveItem(id string, studentID string) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              id,
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       studentID,
		MaterialType:    domain.MaterialTypeHomework,
		Title:           "Student AI Tutor feedback archive qbank_ans_sub_001",
		Source:          domain.SourceSystemImport,
		ContentRef:      "student-ai-tutor-feedback-archive:feedback_archive_cmd_qbank_001:sha256_4249595968f7ea8d603e6620d8f4abb688e52629b10fe0d9244627287fe18463",
		Tags:            []string{"student_app_ai_tutor", "feedback", "question_bank", "archive_commit"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly, domain.AnalysisIntentTutoring},
		OCRStatus:       domain.OCRStatusNotRequired,
		CreatedAt:       time.Date(2026, 6, 6, 10, 30, 0, 0, time.UTC),
	}
}

func questionBankDraftAnswerFeedbackSnapshot(
	feedbackArchiveItemID string,
	submissionID string,
	studentID string,
) domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot {
	return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{
		FeedbackArchiveItemID:     feedbackArchiveItemID,
		SubmissionID:              submissionID,
		StudentID:                 studentID,
		RequestID:                 "grading_req_qbank_answer_feedback_001",
		QuestionBankDraftRef:      "local://question-bank-drafts/tutor_req_feedback_001.json",
		TutoringAnalysisRequestID: "tutor_req_feedback_001",
		SourceArchiveItemID:       "tarch_source_homework_001",
		ScoreSummary:              "score 93",
		LearnerFeedback: domain.QuestionBankDraftAnswerLearnerFeedback{
			Summary:             "Your comparison is close; focus on matching denominators before judging size.",
			Encouragement:       "You identified the key numbers and can fix the reasoning with one more step.",
			NextSteps:           []string{"Rewrite both fractions with a common denominator.", "Compare the numerators only after denominators match."},
			MisconceptionTags:   []string{"denominator-mismatch"},
			PracticeSuggestions: []string{"Try two more fraction comparison items with unlike denominators."},
		},
		SafeLearnerFeedbackOnly: true,
		ReviewedAt:              time.Date(2026, 6, 6, 10, 20, 0, 0, time.UTC),
		ArchivedAt:              time.Date(2026, 6, 6, 10, 30, 0, 0, time.UTC),
		UpdatedAt:               time.Date(2026, 6, 6, 10, 31, 0, 0, time.UTC),
	}
}
