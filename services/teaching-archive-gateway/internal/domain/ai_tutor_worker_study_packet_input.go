package domain

import "time"

type ReadAITutorWorkerStudyPacketInputInput struct {
	Principal PrincipalContext
	RequestID string
	WorkerID  string
}

type NormalizedReadAITutorWorkerStudyPacketInputInput struct {
	Principal PrincipalContext
	RequestID string
	WorkerID  string
}

type AITutorWorkerStudyPacketInput struct {
	RequestID                        string
	ArchiveItemID                    string
	AnalysisGoal                     string
	QuestionBankIntent               QuestionBankIntent
	Status                           TutoringAnalysisStatus
	LearningActionSource             StudentAppAITutorLearningActionSourceType
	FollowUpDepth                    int
	WorkerID                         string
	ClaimExpiresAt                   time.Time
	SourceArchiveStudentID           string
	SourceArchiveMaterial            MaterialType
	PacketStatus                     StudentAppArchiveItemStudyPacketStatus
	ResultArchiveStatus              StudentAppAITutorResultArchiveStatus
	ResultArchiveSourceItemID        string
	ResultArchiveSourceTutoringReqID string
	RenderFormat                     AITutorWorkerStudyPacketInputRenderFormat
	Blocks                           []AITutorWorkerStudyPacketInputBlock
}

type AITutorWorkerStudyPacketInputRenderFormat string

const (
	AITutorWorkerStudyPacketInputRenderFormatSafeTextBlocks AITutorWorkerStudyPacketInputRenderFormat = "SAFE_TEXT_BLOCKS"
)

type AITutorWorkerStudyPacketInputBlockType string

const (
	AITutorWorkerStudyPacketInputBlockTypeSection         AITutorWorkerStudyPacketInputBlockType = "SECTION"
	AITutorWorkerStudyPacketInputBlockTypeSummary         AITutorWorkerStudyPacketInputBlockType = "SUMMARY"
	AITutorWorkerStudyPacketInputBlockTypeGuidanceSection AITutorWorkerStudyPacketInputBlockType = "GUIDANCE_SECTION"
)

type AITutorWorkerStudyPacketInputBlock struct {
	BlockID         string
	BlockType       AITutorWorkerStudyPacketInputBlockType
	SectionID       string
	Title           string
	Text            string
	PageHint        string
	SourceBlockRefs []string
}

func NormalizeReadAITutorWorkerStudyPacketInputInput(
	input ReadAITutorWorkerStudyPacketInputInput,
) (NormalizedReadAITutorWorkerStudyPacketInputInput, error) {
	if err := AuthorizeRecordTutoringAnalysisResult(input.Principal); err != nil {
		return NormalizedReadAITutorWorkerStudyPacketInputInput{}, err
	}
	requestID, err := NormalizeTutoringAnalysisRequestID(input.RequestID)
	if err != nil {
		return NormalizedReadAITutorWorkerStudyPacketInputInput{}, err
	}
	workerID, err := normalizeRequiredText(input.WorkerID, maxTutoringAnalysisWorkerIDLength, "workerId")
	if err != nil {
		return NormalizedReadAITutorWorkerStudyPacketInputInput{}, err
	}
	return NormalizedReadAITutorWorkerStudyPacketInputInput{
		Principal: input.Principal,
		RequestID: requestID,
		WorkerID:  workerID,
	}, nil
}

func ValidateAITutorWorkerStudyPacketRequest(
	input NormalizedReadAITutorWorkerStudyPacketInputInput,
	request TutoringAnalysisRequest,
	now time.Time,
) error {
	if request.ID != input.RequestID {
		return validationError("requestId does not match tutoring analysis request")
	}
	if !validStudentAppAITutorLearningActionSourceType(TutoringAnalysisRequestLearningActionSource(request)) {
		return validationError("tutoring analysis request learning action source is unsupported")
	}
	if !canRecordTutoringAnalysisResult(request, input.WorkerID, now.UTC()) {
		return ErrConflict
	}
	if request.SourceArchiveOwnerType != OwnerTypeStudent ||
		request.SourceArchiveStudentID == "" ||
		request.SourceArchiveMaterial == MaterialTypeTeachingMaterial ||
		!validMaterialType(request.SourceArchiveMaterial) {
		return validationError("tutoring analysis request is not a student app ai tutor request")
	}
	if _, err := normalizeStudentAppArchiveItemID(request.ArchiveItemID); err != nil {
		return err
	}
	return nil
}

func BuildAITutorWorkerStudyPacketInput(
	input NormalizedReadAITutorWorkerStudyPacketInputInput,
	request TutoringAnalysisRequest,
	packet StudentAppArchiveItemStudyPacket,
	now time.Time,
) (AITutorWorkerStudyPacketInput, error) {
	if err := ValidateAITutorWorkerStudyPacketRequest(input, request, now); err != nil {
		return AITutorWorkerStudyPacketInput{}, err
	}
	if TutoringAnalysisRequestLearningActionSource(request) != StudentAppAITutorLearningActionSourcePublishedStudyPacket {
		return AITutorWorkerStudyPacketInput{}, ErrForbidden
	}
	if packet.PacketStatus != StudentAppArchiveItemStudyPacketStatusReady {
		return AITutorWorkerStudyPacketInput{}, ErrForbidden
	}
	studentReadInput := NormalizedReadStudentAppArchiveItemInput{
		Principal:     studentAppPrincipalForAITutorWorkerInput(request.SourceArchiveStudentID),
		ArchiveItemID: request.ArchiveItemID,
		StudentID:     request.SourceArchiveStudentID,
	}
	if _, err := BuildStudentAppArchiveItemMetadata(studentReadInput, packet.ArchiveItem); err != nil {
		return AITutorWorkerStudyPacketInput{}, err
	}
	if packet.ArchiveItem.MaterialType != request.SourceArchiveMaterial ||
		packet.ContentPreview.RenderFormat != PublishedArchiveMaterialContentPreviewRenderFormatSafeTextBlocks {
		return AITutorWorkerStudyPacketInput{}, ErrForbidden
	}
	actions, err := BuildStudentAppArchiveItemLearningActions(studentReadInput, packet)
	if err != nil {
		return AITutorWorkerStudyPacketInput{}, err
	}
	if !aiTutorWorkerStudyPacketActionAvailable(actions, request.QuestionBankIntent) {
		return AITutorWorkerStudyPacketInput{}, ErrForbidden
	}
	return AITutorWorkerStudyPacketInput{
		RequestID:              request.ID,
		ArchiveItemID:          request.ArchiveItemID,
		AnalysisGoal:           request.AnalysisGoal,
		QuestionBankIntent:     request.QuestionBankIntent,
		Status:                 request.Status,
		LearningActionSource:   StudentAppAITutorLearningActionSourcePublishedStudyPacket,
		FollowUpDepth:          request.FollowUpDepth,
		WorkerID:               input.WorkerID,
		ClaimExpiresAt:         request.ClaimExpiresAt.UTC(),
		SourceArchiveStudentID: request.SourceArchiveStudentID,
		SourceArchiveMaterial:  request.SourceArchiveMaterial,
		PacketStatus:           packet.PacketStatus,
		RenderFormat:           AITutorWorkerStudyPacketInputRenderFormatSafeTextBlocks,
		Blocks:                 aiTutorWorkerPublishedBlocks(packet.ContentPreview.Blocks),
	}, nil
}

func BuildAITutorWorkerResultArchiveInput(
	input NormalizedReadAITutorWorkerStudyPacketInputInput,
	request TutoringAnalysisRequest,
	rendered StudentAppAITutorResultArchiveRenderEnvelope,
	now time.Time,
) (AITutorWorkerStudyPacketInput, error) {
	if err := ValidateAITutorWorkerStudyPacketRequest(input, request, now); err != nil {
		return AITutorWorkerStudyPacketInput{}, err
	}
	if TutoringAnalysisRequestLearningActionSource(request) != StudentAppAITutorLearningActionSourceResultArchive {
		return AITutorWorkerStudyPacketInput{}, ErrForbidden
	}
	if rendered.ArchiveItemID != request.ArchiveItemID ||
		rendered.Status != StudentAppAITutorResultArchiveStatusReady ||
		rendered.MaterialType != request.SourceArchiveMaterial ||
		rendered.RenderFormat != StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks {
		return AITutorWorkerStudyPacketInput{}, ErrForbidden
	}
	studentReadInput := BuildAITutorWorkerStudyPacketStudentReadInput(request)
	actions, err := BuildStudentAppAITutorResultArchiveLearningActions(studentReadInput, rendered)
	if err != nil {
		return AITutorWorkerStudyPacketInput{}, err
	}
	if !aiTutorWorkerResultArchiveActionAvailable(actions, request.QuestionBankIntent, request.FollowUpDepth) {
		return AITutorWorkerStudyPacketInput{}, ErrForbidden
	}
	return AITutorWorkerStudyPacketInput{
		RequestID:                        request.ID,
		ArchiveItemID:                    request.ArchiveItemID,
		AnalysisGoal:                     request.AnalysisGoal,
		QuestionBankIntent:               request.QuestionBankIntent,
		Status:                           request.Status,
		LearningActionSource:             StudentAppAITutorLearningActionSourceResultArchive,
		FollowUpDepth:                    request.FollowUpDepth,
		WorkerID:                         input.WorkerID,
		ClaimExpiresAt:                   request.ClaimExpiresAt.UTC(),
		SourceArchiveStudentID:           request.SourceArchiveStudentID,
		SourceArchiveMaterial:            request.SourceArchiveMaterial,
		ResultArchiveStatus:              rendered.Status,
		ResultArchiveSourceItemID:        rendered.SourceArchiveItemID,
		ResultArchiveSourceTutoringReqID: rendered.SourceTutoringRequestID,
		RenderFormat:                     AITutorWorkerStudyPacketInputRenderFormatSafeTextBlocks,
		Blocks:                           aiTutorWorkerResultArchiveBlocks(rendered.Blocks),
	}, nil
}

func aiTutorWorkerStudyPacketActionAvailable(
	actions StudentAppArchiveItemLearningActions,
	intent QuestionBankIntent,
) bool {
	if actions.PacketStatus != StudentAppArchiveItemStudyPacketStatusReady {
		return false
	}
	for _, action := range actions.Actions {
		if action.TargetEndpoint == "/v1/student-app/ai-tutor-requests" &&
			action.Method == "POST" &&
			action.QuestionBankIntent == intent &&
			(action.ActionType == StudentAppArchiveItemLearningActionAITutorRequest ||
				action.ActionType == StudentAppArchiveItemLearningActionPersonalizedQuestionBank) {
			return true
		}
	}
	return false
}

func aiTutorWorkerResultArchiveActionAvailable(
	actions StudentAppAITutorResultArchiveLearningActions,
	intent QuestionBankIntent,
	followUpDepth int,
) bool {
	if actions.Status != StudentAppAITutorResultArchiveStatusReady ||
		actions.RenderFormat != StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks {
		return false
	}
	for _, action := range actions.Actions {
		if action.TargetEndpoint == "/v1/student-app/ai-tutor-requests" &&
			action.Method == "POST" &&
			action.QuestionBankIntent == intent &&
			action.SourceType == StudentAppAITutorLearningActionSourceResultArchive &&
			action.FollowUpDepth == followUpDepth &&
			(action.ActionType == StudentAppArchiveItemLearningActionAITutorRequest ||
				action.ActionType == StudentAppArchiveItemLearningActionPersonalizedQuestionBank) {
			return true
		}
	}
	return false
}

func aiTutorWorkerPublishedBlocks(
	blocks []PublishedArchiveMaterialContentPreviewBlock,
) []AITutorWorkerStudyPacketInputBlock {
	result := make([]AITutorWorkerStudyPacketInputBlock, 0, len(blocks))
	for _, block := range blocks {
		result = append(result, AITutorWorkerStudyPacketInputBlock{
			BlockID:   block.BlockID,
			BlockType: AITutorWorkerStudyPacketInputBlockTypeSection,
			SectionID: block.SectionID,
			Title:     block.Title,
			Text:      block.Text,
			PageHint:  block.PageHint,
		})
	}
	return result
}

func aiTutorWorkerResultArchiveBlocks(
	blocks []StudentAppAITutorResultArchiveRenderBlock,
) []AITutorWorkerStudyPacketInputBlock {
	result := make([]AITutorWorkerStudyPacketInputBlock, 0, len(blocks))
	for _, block := range blocks {
		result = append(result, AITutorWorkerStudyPacketInputBlock{
			BlockID:         block.BlockID,
			BlockType:       aiTutorWorkerResultArchiveBlockType(block.BlockType),
			SectionID:       block.SectionID,
			Title:           block.Title,
			Text:            block.Text,
			SourceBlockRefs: append([]string(nil), block.SourceBlockRefs...),
		})
	}
	return result
}

func aiTutorWorkerResultArchiveBlockType(
	blockType StudentAppAITutorResultArchiveBlockType,
) AITutorWorkerStudyPacketInputBlockType {
	if blockType == StudentAppAITutorResultArchiveBlockTypeSummary {
		return AITutorWorkerStudyPacketInputBlockTypeSummary
	}
	return AITutorWorkerStudyPacketInputBlockTypeGuidanceSection
}

func BuildAITutorWorkerStudyPacketStudentReadInput(
	request TutoringAnalysisRequest,
) NormalizedReadStudentAppArchiveItemInput {
	return NormalizedReadStudentAppArchiveItemInput{
		Principal:     studentAppPrincipalForAITutorWorkerInput(request.SourceArchiveStudentID),
		ArchiveItemID: request.ArchiveItemID,
		StudentID:     request.SourceArchiveStudentID,
	}
}

func studentAppPrincipalForAITutorWorkerInput(studentID string) PrincipalContext {
	wallClockNow := time.Now().UTC()
	return PrincipalContext{
		PrincipalID: studentID,
		SubjectType: SubjectUser,
		Role:        RoleStudent,
		EntryPoint:  EntryPointStudentApp,
		Scopes: []Scope{
			ScopeTeachingRead,
			ScopeStudentOwnRead,
			ScopeStudentOwnWrite,
		},
		KnowledgeAccess: KnowledgeAccess{Public: true, Private: PrivateAccessNone},
		StudentAccess: StudentAccess{
			Mode:       StudentAccessOwn,
			StudentIDs: []string{studentID},
		},
		SessionID: "worker_study_packet_" + studentID,
		IssuedAt:  wallClockNow.Add(-time.Minute),
		ExpiresAt: wallClockNow.Add(time.Hour),
	}
}
