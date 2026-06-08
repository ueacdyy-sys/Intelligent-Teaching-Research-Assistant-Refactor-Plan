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

type createStudentAppAITutorRequestRequest struct {
	StudentArchiveItemID string                                       `json:"studentArchiveItemId"`
	AnalysisGoal         string                                       `json:"analysisGoal"`
	QuestionBankIntent   domain.QuestionBankIntent                    `json:"questionBankIntent,omitempty"`
	LearningActionSource domain.StudentAppAITutorLearningActionSource `json:"learningActionSource,omitempty"`
}

type createAIGradingRequestRequest struct {
	GradingInstructions string `json:"gradingInstructions"`
	RubricRef           string `json:"rubricRef,omitempty"`
}

type createQuizSubmissionRequest struct {
	StudentID string `json:"studentId,omitempty"`
	AnswerRef string `json:"answerRef"`
}

type createScannedQuizSubmissionRequest struct {
	ScanCode  string `json:"scanCode"`
	AnswerRef string `json:"answerRef"`
}

type submitQuestionBankDraftAnswerSubmissionRequest struct {
	QuestionBankDraftRef string                                    `json:"questionBankDraftRef"`
	Answers              []domain.QuestionBankDraftSubmittedAnswer `json:"answers"`
}

type submitTeachingQuizDraftIntentRequest struct {
	Title               string                             `json:"title"`
	SourceMaterialRefs  []string                           `json:"sourceMaterialRefs"`
	LearningObjectives  []string                           `json:"learningObjectives"`
	QuestionCount       int                                `json:"questionCount"`
	Difficulty          domain.TeachingQuizDraftDifficulty `json:"difficulty,omitempty"`
	SharedContextRef    string                             `json:"sharedContextRef"`
	GuardrailResultRef  string                             `json:"guardrailResultRef"`
	RouteDecisionRef    string                             `json:"routeDecisionRef"`
	InputHash           string                             `json:"inputHash"`
	OutputSummary       string                             `json:"outputSummary"`
	ApprovalArtifactRef string                             `json:"approvalArtifactRef"`
	RollbackPlanRef     string                             `json:"rollbackPlanRef"`
	AuditTraceRef       string                             `json:"auditTraceRef"`
	IdempotencyKey      string                             `json:"idempotencyKey"`
}

type submitTeachingArchiveMaterialDraftIntentRequest struct {
	OwnerType           domain.OwnerType        `json:"ownerType"`
	StudentID           string                  `json:"studentId,omitempty"`
	MaterialType        domain.MaterialType     `json:"materialType"`
	Title               string                  `json:"title"`
	Source              domain.Source           `json:"source"`
	SourceRefs          []string                `json:"sourceRefs"`
	DraftArtifactRef    string                  `json:"draftArtifactRef"`
	Tags                []string                `json:"tags,omitempty"`
	AnalysisIntents     []domain.AnalysisIntent `json:"analysisIntents"`
	SharedContextRef    string                  `json:"sharedContextRef"`
	GuardrailResultRef  string                  `json:"guardrailResultRef"`
	RouteDecisionRef    string                  `json:"routeDecisionRef"`
	InputHash           string                  `json:"inputHash"`
	OutputSummary       string                  `json:"outputSummary"`
	ApprovalArtifactRef string                  `json:"approvalArtifactRef"`
	RollbackPlanRef     string                  `json:"rollbackPlanRef"`
	AuditTraceRef       string                  `json:"auditTraceRef"`
	IdempotencyKey      string                  `json:"idempotencyKey"`
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

type readQuestionBankDraftAnswerScoringInputRequest struct {
	WorkerID string `json:"workerId"`
}
