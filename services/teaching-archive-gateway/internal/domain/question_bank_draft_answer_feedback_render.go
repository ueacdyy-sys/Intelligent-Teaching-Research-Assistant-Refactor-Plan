package domain

import (
	"fmt"
	"time"
)

type QuestionBankDraftAnswerFeedbackRenderFormat string

const (
	QuestionBankDraftAnswerFeedbackRenderFormatSafeTextBlocks QuestionBankDraftAnswerFeedbackRenderFormat = "SAFE_TEXT_BLOCKS"
)

type QuestionBankDraftAnswerFeedbackBlockType string

const (
	QuestionBankDraftAnswerFeedbackBlockTypeScoreSummary       QuestionBankDraftAnswerFeedbackBlockType = "SCORE_SUMMARY"
	QuestionBankDraftAnswerFeedbackBlockTypeFeedbackSummary    QuestionBankDraftAnswerFeedbackBlockType = "FEEDBACK_SUMMARY"
	QuestionBankDraftAnswerFeedbackBlockTypeEncouragement      QuestionBankDraftAnswerFeedbackBlockType = "ENCOURAGEMENT"
	QuestionBankDraftAnswerFeedbackBlockTypeNextStep           QuestionBankDraftAnswerFeedbackBlockType = "NEXT_STEP"
	QuestionBankDraftAnswerFeedbackBlockTypeMisconceptionTag   QuestionBankDraftAnswerFeedbackBlockType = "MISCONCEPTION_TAG"
	QuestionBankDraftAnswerFeedbackBlockTypePracticeSuggestion QuestionBankDraftAnswerFeedbackBlockType = "PRACTICE_SUGGESTION"
)

type QuestionBankDraftAnswerFeedbackRenderEnvelope struct {
	SubmissionID              string
	RequestID                 string
	QuestionBankDraftRef      string
	TutoringAnalysisRequestID string
	ArchiveItemID             string
	FeedbackArchiveItemID     string
	Status                    StudentAppQuestionBankDraftAnswerFeedbackStatus
	MaterialType              MaterialType
	Title                     string
	RenderFormat              QuestionBankDraftAnswerFeedbackRenderFormat
	Blocks                    []QuestionBankDraftAnswerFeedbackRenderBlock
	ReviewedAt                time.Time
	ArchivedAt                time.Time
	UpdatedAt                 time.Time
}

type QuestionBankDraftAnswerFeedbackRenderBlock struct {
	BlockID   string
	BlockType QuestionBankDraftAnswerFeedbackBlockType
	Title     string
	Text      string
}

func BuildQuestionBankDraftAnswerFeedbackRenderEnvelope(
	card QuestionBankDraftAnswerFeedbackCard,
) (QuestionBankDraftAnswerFeedbackRenderEnvelope, error) {
	submissionID, err := NormalizeQuestionBankDraftAnswerSubmissionID(card.SubmissionID)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackRenderEnvelope{}, err
	}
	requestID, err := NormalizeAIGradingRequestID(card.RequestID)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackRenderEnvelope{}, err
	}
	draftRef, err := NormalizeQuestionBankDraftRef(card.QuestionBankDraftRef)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackRenderEnvelope{}, err
	}
	tutoringRequestID, err := NormalizeTutoringAnalysisRequestID(card.TutoringAnalysisRequestID)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackRenderEnvelope{}, err
	}
	archiveItemID, err := NormalizeArchiveItemID(card.ArchiveItemID)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackRenderEnvelope{}, err
	}
	feedbackArchiveItemID, err := NormalizeArchiveItemID(card.FeedbackArchiveItemID)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackRenderEnvelope{}, err
	}
	if card.Status != StudentAppQuestionBankDraftAnswerFeedbackStatusReady ||
		card.MaterialType != MaterialTypeHomework {
		return QuestionBankDraftAnswerFeedbackRenderEnvelope{}, ErrForbidden
	}
	title, err := normalizeSafePreviewText(card.Title, maxArchiveTitleLength, "title")
	if err != nil {
		return QuestionBankDraftAnswerFeedbackRenderEnvelope{}, err
	}
	scoreSummary, err := normalizeSafePreviewText(
		card.ScoreSummary,
		maxArchiveMaterialContentPreviewSectionText,
		"scoreSummary",
	)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackRenderEnvelope{}, err
	}
	learnerFeedback, err := normalizeQuestionBankDraftAnswerLearnerFeedback(card.LearnerFeedback)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackRenderEnvelope{}, err
	}
	reviewedAt, err := normalizeQuestionBankDraftAnswerFeedbackTime(card.ReviewedAt, "reviewedAt")
	if err != nil {
		return QuestionBankDraftAnswerFeedbackRenderEnvelope{}, err
	}
	archivedAt, err := normalizeQuestionBankDraftAnswerFeedbackTime(card.ArchivedAt, "archivedAt")
	if err != nil {
		return QuestionBankDraftAnswerFeedbackRenderEnvelope{}, err
	}
	updatedAt, err := normalizeQuestionBankDraftAnswerFeedbackTime(card.UpdatedAt, "updatedAt")
	if err != nil {
		return QuestionBankDraftAnswerFeedbackRenderEnvelope{}, err
	}

	blocks := []QuestionBankDraftAnswerFeedbackRenderBlock{
		{
			BlockID:   "block_score_summary",
			BlockType: QuestionBankDraftAnswerFeedbackBlockTypeScoreSummary,
			Title:     "Score summary",
			Text:      scoreSummary,
		},
		{
			BlockID:   "block_feedback_summary",
			BlockType: QuestionBankDraftAnswerFeedbackBlockTypeFeedbackSummary,
			Title:     "Feedback summary",
			Text:      learnerFeedback.Summary,
		},
		{
			BlockID:   "block_encouragement",
			BlockType: QuestionBankDraftAnswerFeedbackBlockTypeEncouragement,
			Title:     "Encouragement",
			Text:      learnerFeedback.Encouragement,
		},
	}
	blocks = appendFeedbackTextBlocks(blocks, "next_step", "Next step", QuestionBankDraftAnswerFeedbackBlockTypeNextStep, learnerFeedback.NextSteps)
	blocks = appendFeedbackTextBlocks(blocks, "misconception_tag", "Misconception tag", QuestionBankDraftAnswerFeedbackBlockTypeMisconceptionTag, learnerFeedback.MisconceptionTags)
	blocks = appendFeedbackTextBlocks(blocks, "practice_suggestion", "Practice suggestion", QuestionBankDraftAnswerFeedbackBlockTypePracticeSuggestion, learnerFeedback.PracticeSuggestions)

	return QuestionBankDraftAnswerFeedbackRenderEnvelope{
		SubmissionID:              submissionID,
		RequestID:                 requestID,
		QuestionBankDraftRef:      draftRef,
		TutoringAnalysisRequestID: tutoringRequestID,
		ArchiveItemID:             archiveItemID,
		FeedbackArchiveItemID:     feedbackArchiveItemID,
		Status:                    StudentAppQuestionBankDraftAnswerFeedbackStatusReady,
		MaterialType:              card.MaterialType,
		Title:                     title,
		RenderFormat:              QuestionBankDraftAnswerFeedbackRenderFormatSafeTextBlocks,
		Blocks:                    blocks,
		ReviewedAt:                reviewedAt,
		ArchivedAt:                archivedAt,
		UpdatedAt:                 updatedAt,
	}, nil
}

func appendFeedbackTextBlocks(
	blocks []QuestionBankDraftAnswerFeedbackRenderBlock,
	idPrefix string,
	title string,
	blockType QuestionBankDraftAnswerFeedbackBlockType,
	values []string,
) []QuestionBankDraftAnswerFeedbackRenderBlock {
	for index, value := range values {
		blocks = append(blocks, QuestionBankDraftAnswerFeedbackRenderBlock{
			BlockID:   fmt.Sprintf("%s_%03d", idPrefix, index+1),
			BlockType: blockType,
			Title:     title,
			Text:      value,
		})
	}
	return blocks
}
