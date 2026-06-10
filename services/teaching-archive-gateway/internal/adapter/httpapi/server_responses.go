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

type archiveItemAcceptedResponse struct {
	archiveItemResponse
	Command commandResponse `json:"command"`
}

type archiveItemListResponse struct {
	Data     []archiveItemResponse `json:"data"`
	PageInfo pageInfoResponse      `json:"pageInfo"`
}

type studentAppArchiveItemMetadataResponse struct {
	ID              string                  `json:"id"`
	OwnerType       domain.OwnerType        `json:"ownerType"`
	StudentID       string                  `json:"studentId"`
	MaterialType    domain.MaterialType     `json:"materialType"`
	Title           string                  `json:"title"`
	Source          domain.Source           `json:"source"`
	Tags            []string                `json:"tags"`
	AnalysisIntents []domain.AnalysisIntent `json:"analysisIntents"`
	OCRStatus       domain.OCRStatus        `json:"ocrStatus"`
	CreatedAt       string                  `json:"createdAt"`
}

type studentAppArchiveItemContentPreviewResponse struct {
	ArchiveItemID string                                              `json:"archiveItemId"`
	MaterialType  domain.MaterialType                                 `json:"materialType"`
	Title         string                                              `json:"title"`
	PreviewStatus domain.PublishedArchiveMaterialContentPreviewStatus `json:"previewStatus"`
	Sections      []studentAppArchiveItemContentPreviewSection        `json:"sections"`
	CreatedAt     string                                              `json:"createdAt"`
	UpdatedAt     string                                              `json:"updatedAt"`
}

type studentAppArchiveItemContentPreviewSection struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Text     string `json:"text"`
	PageHint string `json:"pageHint,omitempty"`
}

type studentAppArchiveItemContentPreviewRenderResponse struct {
	ArchiveItemID string                                                    `json:"archiveItemId"`
	MaterialType  domain.MaterialType                                       `json:"materialType"`
	Title         string                                                    `json:"title"`
	PreviewStatus domain.PublishedArchiveMaterialContentPreviewStatus       `json:"previewStatus"`
	RenderFormat  domain.PublishedArchiveMaterialContentPreviewRenderFormat `json:"renderFormat"`
	Blocks        []studentAppArchiveItemContentPreviewBlock                `json:"blocks"`
	CreatedAt     string                                                    `json:"createdAt"`
	UpdatedAt     string                                                    `json:"updatedAt"`
}

type studentAppArchiveItemContentPreviewBlock struct {
	BlockID   string                                                 `json:"blockId"`
	BlockType domain.PublishedArchiveMaterialContentPreviewBlockType `json:"blockType"`
	SectionID string                                                 `json:"sectionId"`
	Title     string                                                 `json:"title"`
	Text      string                                                 `json:"text"`
	PageHint  string                                                 `json:"pageHint,omitempty"`
}

type studentAppArchiveItemStudyPacketResponse struct {
	PacketStatus   domain.StudentAppArchiveItemStudyPacketStatus     `json:"packetStatus"`
	ArchiveItem    studentAppArchiveItemStudyPacketMetadata          `json:"archiveItem"`
	ContentPreview studentAppArchiveItemContentPreviewRenderResponse `json:"contentPreview"`
}

type studentAppArchiveItemStudyPacketMetadata struct {
	ID              string                  `json:"id"`
	OwnerType       domain.OwnerType        `json:"ownerType"`
	MaterialType    domain.MaterialType     `json:"materialType"`
	Title           string                  `json:"title"`
	Source          domain.Source           `json:"source"`
	Tags            []string                `json:"tags"`
	AnalysisIntents []domain.AnalysisIntent `json:"analysisIntents"`
	OCRStatus       domain.OCRStatus        `json:"ocrStatus"`
	CreatedAt       string                  `json:"createdAt"`
}

type studentAppArchiveItemLearningActionsResponse struct {
	ArchiveItemID string                                        `json:"archiveItemId"`
	MaterialType  domain.MaterialType                           `json:"materialType"`
	PacketStatus  domain.StudentAppArchiveItemStudyPacketStatus `json:"packetStatus"`
	Actions       []studentAppArchiveItemLearningActionResponse `json:"actions"`
}

type studentAppArchiveItemLearningActionResponse struct {
	ActionType           domain.StudentAppArchiveItemLearningActionType  `json:"actionType"`
	State                domain.StudentAppArchiveItemLearningActionState `json:"state"`
	TargetEndpoint       string                                          `json:"targetEndpoint"`
	Method               string                                          `json:"method"`
	QuestionBankIntent   domain.QuestionBankIntent                       `json:"questionBankIntent,omitempty"`
	RequiresTutorRequest bool                                            `json:"requiresTutorRequest"`
}

type studentAppAITutorResultArchiveCardResponse struct {
	ArchiveItemID        string                                          `json:"archiveItemId"`
	SourceArchiveItemID  string                                          `json:"sourceArchiveItemId"`
	Status               domain.StudentAppAITutorResultArchiveStatus     `json:"status"`
	MaterialType         domain.MaterialType                             `json:"materialType"`
	Title                string                                          `json:"title"`
	Source               domain.Source                                   `json:"source"`
	Tags                 []string                                        `json:"tags"`
	AnalysisIntents      []domain.AnalysisIntent                         `json:"analysisIntents"`
	OCRStatus            domain.OCRStatus                                `json:"ocrStatus"`
	Summary              string                                          `json:"summary"`
	GuidanceSections     []studentAppAITutorResultArchiveGuidanceSection `json:"guidanceSections"`
	GuidanceSectionsHash string                                          `json:"guidanceSectionsHash"`
	SafetyLabels         []string                                        `json:"safetyLabels"`
	CreatedAt            string                                          `json:"createdAt"`
}

type studentAppAITutorResultArchiveGuidanceSection struct {
	SectionID       string   `json:"sectionId"`
	Title           string   `json:"title"`
	Text            string   `json:"text"`
	SourceBlockRefs []string `json:"sourceBlockRefs"`
}

type studentAppAITutorResultArchiveRenderResponse struct {
	ArchiveItemID        string                                            `json:"archiveItemId"`
	SourceArchiveItemID  string                                            `json:"sourceArchiveItemId"`
	Status               domain.StudentAppAITutorResultArchiveStatus       `json:"status"`
	MaterialType         domain.MaterialType                               `json:"materialType"`
	Title                string                                            `json:"title"`
	RenderFormat         domain.StudentAppAITutorResultArchiveRenderFormat `json:"renderFormat"`
	Blocks               []studentAppAITutorResultArchiveRenderBlock       `json:"blocks"`
	GuidanceSectionsHash string                                            `json:"guidanceSectionsHash"`
	SafetyLabels         []string                                          `json:"safetyLabels"`
	CreatedAt            string                                            `json:"createdAt"`
}

type studentAppAITutorResultArchiveRenderBlock struct {
	BlockID         string                                         `json:"blockId"`
	BlockType       domain.StudentAppAITutorResultArchiveBlockType `json:"blockType"`
	SectionID       string                                         `json:"sectionId,omitempty"`
	Title           string                                         `json:"title"`
	Text            string                                         `json:"text"`
	SourceBlockRefs []string                                       `json:"sourceBlockRefs,omitempty"`
}

type studentAppAITutorResultArchiveLearningActionsResponse struct {
	ArchiveItemID       string                                                 `json:"archiveItemId"`
	SourceArchiveItemID string                                                 `json:"sourceArchiveItemId"`
	Status              domain.StudentAppAITutorResultArchiveStatus            `json:"status"`
	MaterialType        domain.MaterialType                                    `json:"materialType"`
	RenderFormat        domain.StudentAppAITutorResultArchiveRenderFormat      `json:"renderFormat"`
	FollowUpDepth       int                                                    `json:"followUpDepth"`
	Actions             []studentAppAITutorResultArchiveLearningActionResponse `json:"actions"`
}

type studentAppAITutorResultArchiveLearningActionResponse struct {
	ActionType           domain.StudentAppArchiveItemLearningActionType     `json:"actionType"`
	State                domain.StudentAppArchiveItemLearningActionState    `json:"state"`
	TargetEndpoint       string                                             `json:"targetEndpoint"`
	Method               string                                             `json:"method"`
	QuestionBankIntent   domain.QuestionBankIntent                          `json:"questionBankIntent,omitempty"`
	RequiresTutorRequest bool                                               `json:"requiresTutorRequest"`
	LearningActionSource studentAppAITutorResultArchiveLearningActionSource `json:"learningActionSource"`
}

type studentAppAITutorResultArchiveLearningActionSource struct {
	SourceType          domain.StudentAppAITutorLearningActionSourceType  `json:"sourceType"`
	ActionType          domain.StudentAppArchiveItemLearningActionType    `json:"actionType"`
	ResultArchiveStatus domain.StudentAppAITutorResultArchiveStatus       `json:"resultArchiveStatus"`
	RenderFormat        domain.StudentAppAITutorResultArchiveRenderFormat `json:"renderFormat"`
	FollowUpDepth       int                                               `json:"followUpDepth"`
}

type tutoringAnalysisRequestListResponse struct {
	Data     []tutoringAnalysisRequestResponse `json:"data"`
	PageInfo pageInfoResponse                  `json:"pageInfo"`
}

type studentAppAITutorRequestProgressListResponse struct {
	Data     []studentAppAITutorRequestProgressResponse      `json:"data"`
	PageInfo pageInfoResponse                                `json:"pageInfo"`
	Summary  studentAppAITutorRequestProgressSummaryResponse `json:"summary"`
}

type studentAppAITutorRequestProgressSummaryOnlyResponse struct {
	Summary studentAppAITutorRequestProgressSummaryResponse `json:"summary"`
}

type studentAppAITutorRequestProgressSummaryResponse struct {
	TotalCount                 int `json:"totalCount"`
	AutoRefreshCount           int `json:"autoRefreshCount"`
	ActionReadyCount           int `json:"actionReadyCount"`
	TeacherReviewRequiredCount int `json:"teacherReviewRequiredCount"`
	FailedCount                int `json:"failedCount"`
}

type studentAppAITutorRequestProgressResponse struct {
	ID                    string                                           `json:"id"`
	ArchiveItemID         string                                           `json:"archiveItemId"`
	AnalysisGoal          string                                           `json:"analysisGoal"`
	QuestionBankIntent    domain.QuestionBankIntent                        `json:"questionBankIntent"`
	Status                domain.TutoringAnalysisStatus                    `json:"status"`
	LearningActionSource  domain.StudentAppAITutorLearningActionSourceType `json:"learningActionSource"`
	FollowUpDepth         int                                              `json:"followUpDepth"`
	SourceArchiveMaterial domain.MaterialType                              `json:"sourceArchiveMaterial"`
	ProgressStage         domain.StudentAppAITutorProgressStage            `json:"progressStage"`
	NextStudentAction     domain.StudentAppAITutorNextAction               `json:"nextStudentAction"`
	PrimaryAction         studentAppAITutorRequestProgressActionResponse   `json:"primaryAction"`
	RefreshPolicy         studentAppAITutorRequestProgressRefreshPolicy    `json:"refreshPolicy"`
	SafeStatusMessage     string                                           `json:"safeStatusMessage"`
	Timeline              []studentAppAITutorRequestProgressStepResponse   `json:"timeline"`
	CreatedAt             string                                           `json:"createdAt"`
	CompletedAt           *string                                          `json:"completedAt,omitempty"`
	UpdatedAt             string                                           `json:"updatedAt"`
}

type studentAppAITutorRequestProgressActionResponse struct {
	ActionType           domain.StudentAppAITutorNextAction          `json:"actionType"`
	State                domain.StudentAppAITutorProgressActionState `json:"state"`
	TargetEndpoint       string                                      `json:"targetEndpoint,omitempty"`
	TargetURL            string                                      `json:"targetUrl,omitempty"`
	Method               string                                      `json:"method,omitempty"`
	ArchiveItemID        string                                      `json:"archiveItemId,omitempty"`
	QuestionBankDraftRef string                                      `json:"questionBankDraftRef,omitempty"`
}

type studentAppAITutorRequestProgressRefreshPolicy struct {
	AutoRefresh    bool                                          `json:"autoRefresh"`
	RefreshAfterMs int                                           `json:"refreshAfterMs"`
	Reason         domain.StudentAppAITutorProgressRefreshReason `json:"reason"`
}

type studentAppAITutorRequestProgressStepResponse struct {
	StepID      string                                     `json:"stepId"`
	Title       string                                     `json:"title"`
	Status      domain.StudentAppAITutorProgressStepStatus `json:"status"`
	CompletedAt *string                                    `json:"completedAt,omitempty"`
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

type quizSubmissionAcceptedResponse struct {
	quizSubmissionResponse
	Command commandResponse `json:"command"`
}

type teachingQuizDraftIntentResponse struct {
	ID                     string                               `json:"id"`
	RequestedByPrincipalID string                               `json:"requestedByPrincipalId"`
	SessionID              string                               `json:"sessionId"`
	Title                  string                               `json:"title"`
	SourceMaterialRefs     []string                             `json:"sourceMaterialRefs"`
	LearningObjectives     []string                             `json:"learningObjectives"`
	QuestionCount          int                                  `json:"questionCount"`
	Difficulty             domain.TeachingQuizDraftDifficulty   `json:"difficulty"`
	Status                 domain.TeachingQuizDraftIntentStatus `json:"status"`
	ApprovalRequired       bool                                 `json:"approvalRequired"`
	EventType              string                               `json:"eventType"`
	SharedContextRef       string                               `json:"sharedContextRef"`
	GuardrailResultRef     string                               `json:"guardrailResultRef"`
	RouteDecisionRef       string                               `json:"routeDecisionRef"`
	InputHash              string                               `json:"inputHash"`
	OutputSummary          string                               `json:"outputSummary"`
	ApprovalArtifactRef    string                               `json:"approvalArtifactRef"`
	RollbackPlanRef        string                               `json:"rollbackPlanRef"`
	AuditTraceRef          string                               `json:"auditTraceRef"`
	IdempotencyKey         string                               `json:"idempotencyKey"`
	CreatedAt              string                               `json:"createdAt"`
}

type teachingQuizDraftIntentAcceptedResponse struct {
	teachingQuizDraftIntentResponse
	Command commandResponse `json:"command"`
}

type teachingArchiveMaterialDraftIntentResponse struct {
	ID                     string                                          `json:"id"`
	RequestedByPrincipalID string                                          `json:"requestedByPrincipalId"`
	SessionID              string                                          `json:"sessionId"`
	OwnerType              domain.OwnerType                                `json:"ownerType"`
	StudentID              *string                                         `json:"studentId,omitempty"`
	MaterialType           domain.MaterialType                             `json:"materialType"`
	Title                  string                                          `json:"title"`
	Source                 domain.Source                                   `json:"source"`
	SourceRefs             []string                                        `json:"sourceRefs"`
	DraftArtifactRef       string                                          `json:"draftArtifactRef"`
	Tags                   []string                                        `json:"tags"`
	AnalysisIntents        []domain.AnalysisIntent                         `json:"analysisIntents"`
	Status                 domain.TeachingArchiveMaterialDraftIntentStatus `json:"status"`
	ApprovalRequired       bool                                            `json:"approvalRequired"`
	EventType              string                                          `json:"eventType"`
	SharedContextRef       string                                          `json:"sharedContextRef"`
	GuardrailResultRef     string                                          `json:"guardrailResultRef"`
	RouteDecisionRef       string                                          `json:"routeDecisionRef"`
	InputHash              string                                          `json:"inputHash"`
	OutputSummary          string                                          `json:"outputSummary"`
	ApprovalArtifactRef    string                                          `json:"approvalArtifactRef"`
	RollbackPlanRef        string                                          `json:"rollbackPlanRef"`
	AuditTraceRef          string                                          `json:"auditTraceRef"`
	IdempotencyKey         string                                          `json:"idempotencyKey"`
	CreatedAt              string                                          `json:"createdAt"`
}

type teachingArchiveMaterialDraftIntentAcceptedResponse struct {
	teachingArchiveMaterialDraftIntentResponse
	Command commandResponse `json:"command"`
}

type commandResponse struct {
	ID         string `json:"id"`
	Status     string `json:"status"`
	ResourceID string `json:"resourceId"`
}

type quizSubmissionListResponse struct {
	Data     []quizSubmissionResponse `json:"data"`
	PageInfo pageInfoResponse         `json:"pageInfo"`
}

type studentAppQuestionBankDraftResponse struct {
	TutoringAnalysisRequestID string              `json:"tutoringAnalysisRequestId"`
	ArchiveItemID             string              `json:"archiveItemId"`
	SourceArchiveMaterial     domain.MaterialType `json:"sourceArchiveMaterial"`
	ResultSummary             string              `json:"resultSummary"`
	ResultRef                 string              `json:"resultRef"`
	QuestionBankDraftRef      string              `json:"questionBankDraftRef"`
	CreatedAt                 string              `json:"createdAt"`
	CompletedAt               string              `json:"completedAt"`
}

type studentAppQuestionBankDraftListResponse struct {
	Data     []studentAppQuestionBankDraftResponse `json:"data"`
	PageInfo pageInfoResponse                      `json:"pageInfo"`
}

type studentAppQuestionBankDraftContentResponse struct {
	QuestionBankDraftRef      string                          `json:"questionBankDraftRef"`
	TutoringAnalysisRequestID string                          `json:"tutoringAnalysisRequestId"`
	ArchiveItemID             string                          `json:"archiveItemId"`
	SourceArchiveMaterial     domain.MaterialType             `json:"sourceArchiveMaterial"`
	ResultSummary             string                          `json:"resultSummary"`
	Items                     []questionBankDraftItemResponse `json:"items"`
	CreatedAt                 string                          `json:"createdAt"`
	UpdatedAt                 string                          `json:"updatedAt"`
}

type questionBankDraftItemResponse struct {
	ID             string `json:"id"`
	QuestionText   string `json:"questionText"`
	LearningTarget string `json:"learningTarget,omitempty"`
}

type questionBankDraftAnswerSubmissionResponse struct {
	ID                        string                                         `json:"id"`
	QuestionBankDraftRef      string                                         `json:"questionBankDraftRef"`
	TutoringAnalysisRequestID string                                         `json:"tutoringAnalysisRequestId"`
	ArchiveItemID             string                                         `json:"archiveItemId"`
	StudentID                 string                                         `json:"studentId"`
	SubmittedByPrincipalID    string                                         `json:"submittedByPrincipalId"`
	Status                    domain.QuestionBankDraftAnswerSubmissionStatus `json:"status"`
	AnswerCount               int                                            `json:"answerCount"`
	SubmittedAt               string                                         `json:"submittedAt"`
}

type questionBankDraftAnswerScoringResultResponse struct {
	SubmissionID              string                 `json:"submissionId"`
	RequestID                 string                 `json:"requestId"`
	QuestionBankDraftRef      string                 `json:"questionBankDraftRef"`
	TutoringAnalysisRequestID string                 `json:"tutoringAnalysisRequestId"`
	ArchiveItemID             string                 `json:"archiveItemId"`
	Status                    domain.AIGradingStatus `json:"status"`
	ScoreSummary              *string                `json:"scoreSummary,omitempty"`
	ErrorCode                 *string                `json:"errorCode,omitempty"`
	RequestedAt               string                 `json:"requestedAt"`
	CompletedAt               *string                `json:"completedAt,omitempty"`
	UpdatedAt                 string                 `json:"updatedAt"`
}

type aiGradingRequestResponse struct {
	ID                                   string                 `json:"id"`
	ArchiveItemID                        string                 `json:"archiveItemId"`
	RequestedByPrincipalID               string                 `json:"requestedByPrincipalId"`
	GradingInstructions                  string                 `json:"gradingInstructions"`
	RubricRef                            *string                `json:"rubricRef,omitempty"`
	Status                               domain.AIGradingStatus `json:"status"`
	SourceArchiveOwnerType               domain.OwnerType       `json:"sourceArchiveOwnerType"`
	SourceArchiveStudentID               *string                `json:"sourceArchiveStudentId,omitempty"`
	SourceArchiveContentRef              string                 `json:"sourceArchiveContentRef"`
	SourceQuizSubmissionID               *string                `json:"sourceQuizSubmissionId,omitempty"`
	SourceAnswerRef                      *string                `json:"sourceAnswerRef,omitempty"`
	SourceQuestionBankDraftRef           *string                `json:"sourceQuestionBankDraftRef,omitempty"`
	SourceQuestionBankAnswerSubmissionID *string                `json:"sourceQuestionBankAnswerSubmissionId,omitempty"`
	SourceArchiveMaterial                domain.MaterialType    `json:"sourceArchiveMaterial"`
	SourceArchiveOCRStatus               domain.OCRStatus       `json:"sourceArchiveOcrStatus"`
	ScoreSummary                         *string                `json:"scoreSummary,omitempty"`
	ResultRef                            *string                `json:"resultRef,omitempty"`
	ErrorCode                            *string                `json:"errorCode,omitempty"`
	ErrorMessage                         *string                `json:"errorMessage,omitempty"`
	ClaimedByWorkerID                    *string                `json:"claimedByWorkerId,omitempty"`
	ClaimExpiresAt                       *string                `json:"claimExpiresAt,omitempty"`
	CreatedAt                            string                 `json:"createdAt"`
	CompletedAt                          *string                `json:"completedAt,omitempty"`
	UpdatedAt                            string                 `json:"updatedAt"`
}

type aiGradingWorkerClaimResponse struct {
	ID                                   string                 `json:"id"`
	ArchiveItemID                        string                 `json:"archiveItemId"`
	GradingInstructions                  string                 `json:"gradingInstructions"`
	RubricRef                            *string                `json:"rubricRef,omitempty"`
	Status                               domain.AIGradingStatus `json:"status"`
	SourceArchiveOwnerType               domain.OwnerType       `json:"sourceArchiveOwnerType"`
	SourceArchiveStudentID               *string                `json:"sourceArchiveStudentId,omitempty"`
	SourceArchiveContentRef              string                 `json:"sourceArchiveContentRef"`
	SourceQuizSubmissionID               *string                `json:"sourceQuizSubmissionId,omitempty"`
	SourceAnswerRef                      *string                `json:"sourceAnswerRef,omitempty"`
	SourceQuestionBankDraftRef           *string                `json:"sourceQuestionBankDraftRef,omitempty"`
	SourceQuestionBankAnswerSubmissionID *string                `json:"sourceQuestionBankAnswerSubmissionId,omitempty"`
	SourceArchiveMaterial                domain.MaterialType    `json:"sourceArchiveMaterial"`
	SourceArchiveOCRStatus               domain.OCRStatus       `json:"sourceArchiveOcrStatus"`
	ClaimedByWorkerID                    string                 `json:"claimedByWorkerId"`
	ClaimExpiresAt                       string                 `json:"claimExpiresAt"`
	CreatedAt                            string                 `json:"createdAt"`
	UpdatedAt                            string                 `json:"updatedAt"`
}

type questionBankDraftAnswerScoringInputResponse struct {
	RequestID                            string                                    `json:"requestId"`
	ArchiveItemID                        string                                    `json:"archiveItemId"`
	GradingInstructions                  string                                    `json:"gradingInstructions"`
	RubricRef                            *string                                   `json:"rubricRef,omitempty"`
	Status                               domain.AIGradingStatus                    `json:"status"`
	WorkerID                             string                                    `json:"workerId"`
	ClaimExpiresAt                       string                                    `json:"claimExpiresAt"`
	SourceArchiveStudentID               string                                    `json:"sourceArchiveStudentId"`
	SourceQuestionBankDraftRef           string                                    `json:"sourceQuestionBankDraftRef"`
	SourceQuestionBankAnswerSubmissionID string                                    `json:"sourceQuestionBankAnswerSubmissionId"`
	SourceArchiveMaterial                domain.MaterialType                       `json:"sourceArchiveMaterial"`
	TutoringAnalysisRequestID            string                                    `json:"tutoringAnalysisRequestId"`
	Items                                []questionBankDraftAnswerScoringInputItem `json:"items"`
}

type questionBankDraftAnswerScoringInputItem struct {
	ItemID         string `json:"itemId"`
	QuestionText   string `json:"questionText"`
	AnswerText     string `json:"answerText"`
	ExpectedAnswer string `json:"expectedAnswer"`
	Explanation    string `json:"explanation"`
	LearningTarget string `json:"learningTarget,omitempty"`
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
	ID                     string                                           `json:"id"`
	ArchiveItemID          string                                           `json:"archiveItemId"`
	AnalysisGoal           string                                           `json:"analysisGoal"`
	QuestionBankIntent     domain.QuestionBankIntent                        `json:"questionBankIntent"`
	Status                 domain.TutoringAnalysisStatus                    `json:"status"`
	LearningActionSource   domain.StudentAppAITutorLearningActionSourceType `json:"learningActionSource"`
	SourceArchiveOwnerType domain.OwnerType                                 `json:"sourceArchiveOwnerType"`
	SourceArchiveStudentID *string                                          `json:"sourceArchiveStudentId,omitempty"`
	SourceArchiveMaterial  domain.MaterialType                              `json:"sourceArchiveMaterial"`
	ClaimedByWorkerID      string                                           `json:"claimedByWorkerId"`
	ClaimExpiresAt         string                                           `json:"claimExpiresAt"`
	CreatedAt              string                                           `json:"createdAt"`
	UpdatedAt              string                                           `json:"updatedAt"`
}

type aiTutorWorkerStudyPacketInputResponse struct {
	RequestID                 string                                           `json:"requestId"`
	ArchiveItemID             string                                           `json:"archiveItemId"`
	AnalysisGoal              string                                           `json:"analysisGoal"`
	QuestionBankIntent        domain.QuestionBankIntent                        `json:"questionBankIntent"`
	Status                    domain.TutoringAnalysisStatus                    `json:"status"`
	LearningActionSource      domain.StudentAppAITutorLearningActionSourceType `json:"learningActionSource"`
	FollowUpDepth             int                                              `json:"followUpDepth,omitempty"`
	WorkerID                  string                                           `json:"workerId"`
	ClaimExpiresAt            string                                           `json:"claimExpiresAt"`
	SourceArchiveStudentID    string                                           `json:"sourceArchiveStudentId"`
	SourceArchiveMaterial     domain.MaterialType                              `json:"sourceArchiveMaterial"`
	PacketStatus              domain.StudentAppArchiveItemStudyPacketStatus    `json:"packetStatus,omitempty"`
	ResultArchiveStatus       domain.StudentAppAITutorResultArchiveStatus      `json:"resultArchiveStatus,omitempty"`
	ResultArchiveSourceItemID string                                           `json:"resultArchiveSourceItemId,omitempty"`
	RenderFormat              domain.AITutorWorkerStudyPacketInputRenderFormat `json:"renderFormat"`
	Blocks                    []aiTutorWorkerStudyPacketInputBlock             `json:"blocks"`
}

type aiTutorWorkerStudyPacketInputBlock struct {
	BlockID         string                                        `json:"blockId"`
	BlockType       domain.AITutorWorkerStudyPacketInputBlockType `json:"blockType"`
	SectionID       string                                        `json:"sectionId,omitempty"`
	Title           string                                        `json:"title"`
	Text            string                                        `json:"text"`
	PageHint        string                                        `json:"pageHint,omitempty"`
	SourceBlockRefs []string                                      `json:"sourceBlockRefs,omitempty"`
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
