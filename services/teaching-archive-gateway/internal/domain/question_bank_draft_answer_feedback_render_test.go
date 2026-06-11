package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestBuildQuestionBankDraftAnswerFeedbackRenderEnvelopeReturnsSafeTextBlocks(t *testing.T) {
	rendered, err := domain.BuildQuestionBankDraftAnswerFeedbackRenderEnvelope(questionBankDraftAnswerFeedbackCardFixture())
	if err != nil {
		t.Fatalf("BuildQuestionBankDraftAnswerFeedbackRenderEnvelope returned error: %v", err)
	}
	if rendered.RenderFormat != domain.QuestionBankDraftAnswerFeedbackRenderFormatSafeTextBlocks ||
		rendered.Status != domain.StudentAppQuestionBankDraftAnswerFeedbackStatusReady ||
		rendered.SubmissionID != "qbank_ans_sub_001" ||
		rendered.FeedbackArchiveItemID != "tarch_student_feedback_001" ||
		rendered.ArchiveItemID != "tarch_source_homework_001" {
		t.Fatalf("rendered = %#v", rendered)
	}
	if len(rendered.Blocks) != 8 {
		t.Fatalf("blocks = %#v", rendered.Blocks)
	}
	if rendered.Blocks[0].BlockType != domain.QuestionBankDraftAnswerFeedbackBlockTypeScoreSummary ||
		rendered.Blocks[0].Text != "score 93" {
		t.Fatalf("score block = %#v", rendered.Blocks[0])
	}
	if rendered.Blocks[1].BlockType != domain.QuestionBankDraftAnswerFeedbackBlockTypeFeedbackSummary ||
		rendered.Blocks[1].Text != "Your comparison is close; focus on matching denominators before judging size." {
		t.Fatalf("summary block = %#v", rendered.Blocks[1])
	}
	if rendered.Blocks[3].BlockType != domain.QuestionBankDraftAnswerFeedbackBlockTypeNextStep ||
		rendered.Blocks[3].BlockID != "next_step_001" {
		t.Fatalf("next step block = %#v", rendered.Blocks[3])
	}
	if rendered.Blocks[5].BlockType != domain.QuestionBankDraftAnswerFeedbackBlockTypeMisconceptionTag ||
		rendered.Blocks[6].BlockType != domain.QuestionBankDraftAnswerFeedbackBlockTypePracticeSuggestion {
		t.Fatalf("tail blocks = %#v", rendered.Blocks)
	}
}

func TestBuildQuestionBankDraftAnswerFeedbackRenderEnvelopeRejectsUnsafeCard(t *testing.T) {
	for name, mutate := range map[string]func(*domain.QuestionBankDraftAnswerFeedbackCard){
		"wrong status": func(card *domain.QuestionBankDraftAnswerFeedbackCard) {
			card.Status = ""
		},
		"unsafe feedback": func(card *domain.QuestionBankDraftAnswerFeedbackCard) {
			card.LearnerFeedback.NextSteps[0] = "<script>alert(1)</script>"
		},
		"missing timestamp": func(card *domain.QuestionBankDraftAnswerFeedbackCard) {
			card.ArchivedAt = time.Time{}
		},
		"missing feedback archive item": func(card *domain.QuestionBankDraftAnswerFeedbackCard) {
			card.FeedbackArchiveItemID = ""
		},
		"wrong material type": func(card *domain.QuestionBankDraftAnswerFeedbackCard) {
			card.MaterialType = domain.MaterialTypeQuiz
		},
	} {
		t.Run(name, func(t *testing.T) {
			card := questionBankDraftAnswerFeedbackCardFixture()
			mutate(&card)
			_, err := domain.BuildQuestionBankDraftAnswerFeedbackRenderEnvelope(card)
			if !errors.Is(err, domain.ErrForbidden) && !errors.Is(err, domain.ErrValidation) {
				t.Fatalf("error = %v, want ErrForbidden or ErrValidation", err)
			}
		})
	}
}

func questionBankDraftAnswerFeedbackCardFixture() domain.QuestionBankDraftAnswerFeedbackCard {
	return domain.QuestionBankDraftAnswerFeedbackCard{
		SubmissionID:              "qbank_ans_sub_001",
		RequestID:                 "grading_req_qbank_answer_feedback_001",
		QuestionBankDraftRef:      "local://question-bank-drafts/tutor_req_feedback_001.json",
		TutoringAnalysisRequestID: "tutor_req_feedback_001",
		ArchiveItemID:             "tarch_source_homework_001",
		FeedbackArchiveItemID:     "tarch_student_feedback_001",
		Status:                    domain.StudentAppQuestionBankDraftAnswerFeedbackStatusReady,
		MaterialType:              domain.MaterialTypeHomework,
		Title:                     "Student AI Tutor feedback archive qbank_ans_sub_001",
		Source:                    domain.SourceSystemImport,
		Tags:                      []string{"student_app_ai_tutor", "feedback", "question_bank", "archive_commit"},
		AnalysisIntents:           []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly, domain.AnalysisIntentTutoring},
		OCRStatus:                 domain.OCRStatusNotRequired,
		ScoreSummary:              "score 93",
		LearnerFeedback: domain.QuestionBankDraftAnswerLearnerFeedback{
			Summary:             "Your comparison is close; focus on matching denominators before judging size.",
			Encouragement:       "You identified the key numbers and can fix the reasoning with one more step.",
			NextSteps:           []string{"Rewrite both fractions with a common denominator.", "Compare the numerators only after denominators match."},
			MisconceptionTags:   []string{"denominator-mismatch"},
			PracticeSuggestions: []string{"Try two more fraction comparison items with unlike denominators.", "Check each answer by explaining the comparison aloud."},
		},
		ReviewedAt: time.Date(2026, 6, 6, 10, 20, 0, 0, time.UTC),
		ArchivedAt: time.Date(2026, 6, 6, 10, 30, 0, 0, time.UTC),
		UpdatedAt:  time.Date(2026, 6, 6, 10, 31, 0, 0, time.UTC),
	}
}
