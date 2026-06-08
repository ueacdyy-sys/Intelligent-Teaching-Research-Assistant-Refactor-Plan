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
	RequestID              string
	ArchiveItemID          string
	AnalysisGoal           string
	QuestionBankIntent     QuestionBankIntent
	Status                 TutoringAnalysisStatus
	WorkerID               string
	ClaimExpiresAt         time.Time
	SourceArchiveStudentID string
	SourceArchiveMaterial  MaterialType
	PacketStatus           StudentAppArchiveItemStudyPacketStatus
	RenderFormat           PublishedArchiveMaterialContentPreviewRenderFormat
	Blocks                 []PublishedArchiveMaterialContentPreviewBlock
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
	if packet.PacketStatus != StudentAppArchiveItemStudyPacketStatusReady {
		return AITutorWorkerStudyPacketInput{}, ErrForbidden
	}
	studentReadInput := NormalizedReadStudentAppArchiveItemInput{
		Principal:     studentAppPrincipalForAITutorWorkerInput(request.SourceArchiveStudentID, now),
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
	blocks := append([]PublishedArchiveMaterialContentPreviewBlock(nil), packet.ContentPreview.Blocks...)
	return AITutorWorkerStudyPacketInput{
		RequestID:              request.ID,
		ArchiveItemID:          request.ArchiveItemID,
		AnalysisGoal:           request.AnalysisGoal,
		QuestionBankIntent:     request.QuestionBankIntent,
		Status:                 request.Status,
		WorkerID:               input.WorkerID,
		ClaimExpiresAt:         request.ClaimExpiresAt.UTC(),
		SourceArchiveStudentID: request.SourceArchiveStudentID,
		SourceArchiveMaterial:  request.SourceArchiveMaterial,
		PacketStatus:           packet.PacketStatus,
		RenderFormat:           packet.ContentPreview.RenderFormat,
		Blocks:                 blocks,
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

func studentAppPrincipalForAITutorWorkerInput(studentID string, now time.Time) PrincipalContext {
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
		IssuedAt:  now.UTC().Add(-time.Minute),
		ExpiresAt: now.UTC().Add(time.Hour),
	}
}
