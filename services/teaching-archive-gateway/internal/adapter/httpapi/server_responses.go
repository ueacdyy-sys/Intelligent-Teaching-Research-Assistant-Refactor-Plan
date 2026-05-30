package httpapi

import "ita-refactor/services/teaching-archive-gateway/internal/domain"

type archiveItemResponse struct {
	ID              string                  `json:"id"`
	OwnerType       domain.OwnerType        `json:"ownerType"`
	StudentID       *string                 `json:"studentId,omitempty"`
	MaterialType    domain.MaterialType     `json:"materialType"`
	Title           string                  `json:"title"`
	Source          domain.Source           `json:"source"`
	ContentRef      string                  `json:"contentRef"`
	Tags            []string                `json:"tags"`
	AnalysisIntents []domain.AnalysisIntent `json:"analysisIntents"`
	OCRStatus       domain.OCRStatus        `json:"ocrStatus"`
	CreatedAt       string                  `json:"createdAt"`
}

type archiveItemListResponse struct {
	Data     []archiveItemResponse `json:"data"`
	PageInfo pageInfoResponse      `json:"pageInfo"`
}

type tutoringAnalysisRequestListResponse struct {
	Data     []tutoringAnalysisRequestResponse `json:"data"`
	PageInfo pageInfoResponse                  `json:"pageInfo"`
}

type aiGradingRequestListResponse struct {
	Data     []aiGradingRequestResponse `json:"data"`
	PageInfo pageInfoResponse           `json:"pageInfo"`
}

type quizSubmissionResponse struct {
	ID                     string                      `json:"id"`
	QuizArchiveItemID      string                      `json:"quizArchiveItemId"`
	StudentID              string                      `json:"studentId"`
	SubmittedByPrincipalID string                      `json:"submittedByPrincipalId"`
	AnswerRef              string                      `json:"answerRef"`
	Status                 domain.QuizSubmissionStatus `json:"status"`
	SubmittedAt            string                      `json:"submittedAt"`
}

type quizSubmissionListResponse struct {
	Data     []quizSubmissionResponse `json:"data"`
	PageInfo pageInfoResponse         `json:"pageInfo"`
}

type aiGradingRequestResponse struct {
	ID                     string                 `json:"id"`
	ArchiveItemID          string                 `json:"archiveItemId"`
	RequestedByPrincipalID string                 `json:"requestedByPrincipalId"`
	GradingInstructions    string                 `json:"gradingInstructions"`
	RubricRef              *string                `json:"rubricRef,omitempty"`
	Status                 domain.AIGradingStatus `json:"status"`
	SourceArchiveOwnerType domain.OwnerType       `json:"sourceArchiveOwnerType"`
	SourceArchiveStudentID *string                `json:"sourceArchiveStudentId,omitempty"`
	SourceArchiveMaterial  domain.MaterialType    `json:"sourceArchiveMaterial"`
	SourceArchiveOCRStatus domain.OCRStatus       `json:"sourceArchiveOcrStatus"`
	ScoreSummary           *string                `json:"scoreSummary,omitempty"`
	ResultRef              *string                `json:"resultRef,omitempty"`
	ErrorCode              *string                `json:"errorCode,omitempty"`
	ErrorMessage           *string                `json:"errorMessage,omitempty"`
	ClaimedByWorkerID      *string                `json:"claimedByWorkerId,omitempty"`
	ClaimExpiresAt         *string                `json:"claimExpiresAt,omitempty"`
	CreatedAt              string                 `json:"createdAt"`
	CompletedAt            *string                `json:"completedAt,omitempty"`
	UpdatedAt              string                 `json:"updatedAt"`
}

type aiGradingWorkerClaimResponse struct {
	ID                     string                 `json:"id"`
	ArchiveItemID          string                 `json:"archiveItemId"`
	GradingInstructions    string                 `json:"gradingInstructions"`
	RubricRef              *string                `json:"rubricRef,omitempty"`
	Status                 domain.AIGradingStatus `json:"status"`
	SourceArchiveOwnerType domain.OwnerType       `json:"sourceArchiveOwnerType"`
	SourceArchiveStudentID *string                `json:"sourceArchiveStudentId,omitempty"`
	SourceArchiveMaterial  domain.MaterialType    `json:"sourceArchiveMaterial"`
	SourceArchiveOCRStatus domain.OCRStatus       `json:"sourceArchiveOcrStatus"`
	ClaimedByWorkerID      string                 `json:"claimedByWorkerId"`
	ClaimExpiresAt         string                 `json:"claimExpiresAt"`
	CreatedAt              string                 `json:"createdAt"`
	UpdatedAt              string                 `json:"updatedAt"`
}

type tutoringAnalysisRequestResponse struct {
	ID                     string                        `json:"id"`
	ArchiveItemID          string                        `json:"archiveItemId"`
	RequestedByPrincipalID string                        `json:"requestedByPrincipalId"`
	AnalysisGoal           string                        `json:"analysisGoal"`
	QuestionBankIntent     domain.QuestionBankIntent     `json:"questionBankIntent"`
	Status                 domain.TutoringAnalysisStatus `json:"status"`
	SourceArchiveOwnerType domain.OwnerType              `json:"sourceArchiveOwnerType"`
	SourceArchiveStudentID *string                       `json:"sourceArchiveStudentId,omitempty"`
	SourceArchiveMaterial  domain.MaterialType           `json:"sourceArchiveMaterial"`
	ResultSummary          *string                       `json:"resultSummary,omitempty"`
	ResultRef              *string                       `json:"resultRef,omitempty"`
	QuestionBankDraftRef   *string                       `json:"questionBankDraftRef,omitempty"`
	ErrorCode              *string                       `json:"errorCode,omitempty"`
	ErrorMessage           *string                       `json:"errorMessage,omitempty"`
	CreatedAt              string                        `json:"createdAt"`
	CompletedAt            *string                       `json:"completedAt,omitempty"`
	UpdatedAt              *string                       `json:"updatedAt,omitempty"`
}

type tutoringAnalysisWorkerClaimResponse struct {
	ID                     string                        `json:"id"`
	ArchiveItemID          string                        `json:"archiveItemId"`
	AnalysisGoal           string                        `json:"analysisGoal"`
	QuestionBankIntent     domain.QuestionBankIntent     `json:"questionBankIntent"`
	Status                 domain.TutoringAnalysisStatus `json:"status"`
	SourceArchiveOwnerType domain.OwnerType              `json:"sourceArchiveOwnerType"`
	SourceArchiveStudentID *string                       `json:"sourceArchiveStudentId,omitempty"`
	SourceArchiveMaterial  domain.MaterialType           `json:"sourceArchiveMaterial"`
	ClaimedByWorkerID      string                        `json:"claimedByWorkerId"`
	ClaimExpiresAt         string                        `json:"claimExpiresAt"`
	CreatedAt              string                        `json:"createdAt"`
	UpdatedAt              string                        `json:"updatedAt"`
}

type pageInfoResponse struct {
	PageSize   int     `json:"pageSize"`
	HasMore    bool    `json:"hasMore"`
	NextCursor *string `json:"nextCursor"`
}

type errorResponse struct {
	Error apiError `json:"error"`
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
