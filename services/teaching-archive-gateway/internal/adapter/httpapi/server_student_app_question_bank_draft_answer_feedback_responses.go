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
