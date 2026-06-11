package httpapi

import "ita-refactor/services/teaching-archive-gateway/internal/domain"

type questionBankDraftAnswerFeedbackRenderResponse struct {
	SubmissionID              string                                                 `json:"submissionId"`
	RequestID                 string                                                 `json:"requestId"`
	QuestionBankDraftRef      string                                                 `json:"questionBankDraftRef"`
	TutoringAnalysisRequestID string                                                 `json:"tutoringAnalysisRequestId"`
	ArchiveItemID             string                                                 `json:"archiveItemId"`
	FeedbackArchiveItemID     string                                                 `json:"feedbackArchiveItemId"`
	Status                    domain.StudentAppQuestionBankDraftAnswerFeedbackStatus `json:"status"`
	MaterialType              domain.MaterialType                                    `json:"materialType"`
	Title                     string                                                 `json:"title"`
	RenderFormat              domain.QuestionBankDraftAnswerFeedbackRenderFormat     `json:"renderFormat"`
	Blocks                    []questionBankDraftAnswerFeedbackRenderBlock           `json:"blocks"`
	ReviewedAt                string                                                 `json:"reviewedAt"`
	ArchivedAt                string                                                 `json:"archivedAt"`
	UpdatedAt                 string                                                 `json:"updatedAt"`
}

type questionBankDraftAnswerFeedbackRenderBlock struct {
	BlockID   string                                          `json:"blockId"`
	BlockType domain.QuestionBankDraftAnswerFeedbackBlockType `json:"blockType"`
	Title     string                                          `json:"title"`
	Text      string                                          `json:"text"`
}

type questionBankDraftAnswerFeedbackLearningActionsResponse struct {
	SubmissionID          string                                                 `json:"submissionId"`
	ArchiveItemID         string                                                 `json:"archiveItemId"`
	FeedbackArchiveItemID string                                                 `json:"feedbackArchiveItemId"`
	Status                domain.StudentAppQuestionBankDraftAnswerFeedbackStatus `json:"status"`
	MaterialType          domain.MaterialType                                    `json:"materialType"`
	RenderFormat          domain.QuestionBankDraftAnswerFeedbackRenderFormat     `json:"renderFormat"`
	Actions               []questionBankDraftAnswerFeedbackLearningAction        `json:"actions"`
}

type questionBankDraftAnswerFeedbackLearningAction struct {
	ActionType           domain.StudentAppArchiveItemLearningActionType      `json:"actionType"`
	State                domain.StudentAppArchiveItemLearningActionState     `json:"state"`
	TargetEndpoint       string                                              `json:"targetEndpoint"`
	Method               string                                              `json:"method"`
	QuestionBankIntent   domain.QuestionBankIntent                           `json:"questionBankIntent,omitempty"`
	RequiresTutorRequest bool                                                `json:"requiresTutorRequest"`
	LearningActionSource questionBankDraftAnswerFeedbackLearningActionSource `json:"learningActionSource"`
}

type questionBankDraftAnswerFeedbackLearningActionSource struct {
	SourceType           domain.StudentAppAITutorLearningActionSourceType       `json:"sourceType"`
	ActionType           domain.StudentAppArchiveItemLearningActionType         `json:"actionType"`
	SubmissionID         string                                                 `json:"submissionId"`
	FeedbackStatus       domain.StudentAppQuestionBankDraftAnswerFeedbackStatus `json:"feedbackStatus"`
	FeedbackRenderFormat domain.QuestionBankDraftAnswerFeedbackRenderFormat     `json:"feedbackRenderFormat"`
}
