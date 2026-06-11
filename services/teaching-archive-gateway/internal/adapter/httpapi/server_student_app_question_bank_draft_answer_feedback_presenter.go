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

func toStudentAppQuestionBankDraftAnswerFeedbackRenderResponse(
	rendered domain.QuestionBankDraftAnswerFeedbackRenderEnvelope,
) questionBankDraftAnswerFeedbackRenderResponse {
	blocks := make([]questionBankDraftAnswerFeedbackRenderBlock, 0, len(rendered.Blocks))
	for _, block := range rendered.Blocks {
		blocks = append(blocks, questionBankDraftAnswerFeedbackRenderBlock{
			BlockID:   block.BlockID,
			BlockType: block.BlockType,
			Title:     block.Title,
			Text:      block.Text,
		})
	}
	return questionBankDraftAnswerFeedbackRenderResponse{
		SubmissionID:              rendered.SubmissionID,
		RequestID:                 rendered.RequestID,
		QuestionBankDraftRef:      rendered.QuestionBankDraftRef,
		TutoringAnalysisRequestID: rendered.TutoringAnalysisRequestID,
		ArchiveItemID:             rendered.ArchiveItemID,
		FeedbackArchiveItemID:     rendered.FeedbackArchiveItemID,
		Status:                    rendered.Status,
		MaterialType:              rendered.MaterialType,
		Title:                     rendered.Title,
		RenderFormat:              rendered.RenderFormat,
		Blocks:                    blocks,
		ReviewedAt:                formatTime(rendered.ReviewedAt),
		ArchivedAt:                formatTime(rendered.ArchivedAt),
		UpdatedAt:                 formatTime(rendered.UpdatedAt),
	}
}

func toStudentAppQuestionBankDraftAnswerFeedbackLearningActionsResponse(
	actions domain.QuestionBankDraftAnswerFeedbackLearningActions,
) questionBankDraftAnswerFeedbackLearningActionsResponse {
	response := questionBankDraftAnswerFeedbackLearningActionsResponse{
		SubmissionID:          actions.SubmissionID,
		ArchiveItemID:         actions.ArchiveItemID,
		FeedbackArchiveItemID: actions.FeedbackArchiveItemID,
		Status:                actions.Status,
		MaterialType:          actions.MaterialType,
		RenderFormat:          actions.RenderFormat,
		Actions:               make([]questionBankDraftAnswerFeedbackLearningAction, 0, len(actions.Actions)),
	}
	for _, action := range actions.Actions {
		response.Actions = append(response.Actions, questionBankDraftAnswerFeedbackLearningAction{
			ActionType:           action.ActionType,
			State:                action.State,
			TargetEndpoint:       action.TargetEndpoint,
			Method:               action.Method,
			QuestionBankIntent:   action.QuestionBankIntent,
			RequiresTutorRequest: action.RequiresTutorRequest,
			LearningActionSource: questionBankDraftAnswerFeedbackLearningActionSource{
				SourceType:           action.SourceType,
				ActionType:           action.ActionType,
				SubmissionID:         actions.SubmissionID,
				FeedbackStatus:       actions.Status,
				FeedbackRenderFormat: actions.RenderFormat,
			},
		})
	}
	return response
}
