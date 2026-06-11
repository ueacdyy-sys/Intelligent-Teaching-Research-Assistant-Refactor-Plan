package httpapi

import "ita-refactor/services/teaching-archive-gateway/internal/domain"

func toStudentAppQuestionBankDraftAnswerFeedbackResponse(
	feedback domain.QuestionBankDraftAnswerFeedbackCard,
) questionBankDraftAnswerFeedbackResponse {
	return questionBankDraftAnswerFeedbackResponse{
		SubmissionID:              feedback.SubmissionID,
		RequestID:                 feedback.RequestID,
		QuestionBankDraftRef:      feedback.QuestionBankDraftRef,
		TutoringAnalysisRequestID: feedback.TutoringAnalysisRequestID,
		ArchiveItemID:             feedback.ArchiveItemID,
		FeedbackArchiveItemID:     feedback.FeedbackArchiveItemID,
		Status:                    feedback.Status,
		MaterialType:              feedback.MaterialType,
		Title:                     feedback.Title,
		Source:                    feedback.Source,
		Tags:                      feedback.Tags,
		AnalysisIntents:           feedback.AnalysisIntents,
		OCRStatus:                 feedback.OCRStatus,
		ScoreSummary:              feedback.ScoreSummary,
		LearnerFeedback: questionBankDraftAnswerLearnerFeedback{
			Summary:             feedback.LearnerFeedback.Summary,
			Encouragement:       feedback.LearnerFeedback.Encouragement,
			NextSteps:           feedback.LearnerFeedback.NextSteps,
			MisconceptionTags:   feedback.LearnerFeedback.MisconceptionTags,
			PracticeSuggestions: feedback.LearnerFeedback.PracticeSuggestions,
		},
		ReviewedAt: formatTime(feedback.ReviewedAt),
		ArchivedAt: formatTime(feedback.ArchivedAt),
		UpdatedAt:  formatTime(feedback.UpdatedAt),
	}
}
