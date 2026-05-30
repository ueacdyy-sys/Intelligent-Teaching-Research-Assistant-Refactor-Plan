package httpapi

import "ita-refactor/services/teaching-archive-gateway/internal/domain"

type createArchiveItemRequest struct {
	OwnerType       domain.OwnerType        `json:"ownerType"`
	StudentID       string                  `json:"studentId,omitempty"`
	MaterialType    domain.MaterialType     `json:"materialType"`
	Title           string                  `json:"title"`
	Source          domain.Source           `json:"source"`
	ContentRef      string                  `json:"contentRef"`
	Tags            []string                `json:"tags,omitempty"`
	AnalysisIntents []domain.AnalysisIntent `json:"analysisIntents"`
	OCRReserved     bool                    `json:"ocrReserved,omitempty"`
}

type createTutoringAnalysisRequestRequest struct {
	AnalysisGoal       string                    `json:"analysisGoal"`
	QuestionBankIntent domain.QuestionBankIntent `json:"questionBankIntent,omitempty"`
}

type createAIGradingRequestRequest struct {
	GradingInstructions string `json:"gradingInstructions"`
	RubricRef           string `json:"rubricRef,omitempty"`
}

type createQuizSubmissionRequest struct {
	StudentID string `json:"studentId,omitempty"`
	AnswerRef string `json:"answerRef"`
}

type recordTutoringAnalysisResultRequest struct {
	Status               domain.TutoringAnalysisStatus `json:"status"`
	WorkerID             string                        `json:"workerId"`
	ResultSummary        string                        `json:"resultSummary,omitempty"`
	ResultRef            string                        `json:"resultRef,omitempty"`
	QuestionBankDraftRef string                        `json:"questionBankDraftRef,omitempty"`
	ErrorCode            string                        `json:"errorCode,omitempty"`
	ErrorMessage         string                        `json:"errorMessage,omitempty"`
}

type recordAIGradingResultRequest struct {
	Status       domain.AIGradingStatus `json:"status"`
	WorkerID     string                 `json:"workerId"`
	ScoreSummary string                 `json:"scoreSummary,omitempty"`
	ResultRef    string                 `json:"resultRef,omitempty"`
	ErrorCode    string                 `json:"errorCode,omitempty"`
	ErrorMessage string                 `json:"errorMessage,omitempty"`
}

type claimTutoringAnalysisRequestRequest struct {
	WorkerID     string `json:"workerId"`
	LeaseSeconds int    `json:"leaseSeconds,omitempty"`
}

type claimAIGradingRequestRequest struct {
	WorkerID     string `json:"workerId"`
	LeaseSeconds int    `json:"leaseSeconds,omitempty"`
}
