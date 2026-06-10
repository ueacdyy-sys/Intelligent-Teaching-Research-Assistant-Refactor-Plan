package domain

type StudentAppAITutorResultArchiveLearningActions struct {
	ArchiveItemID           string
	SourceArchiveItemID     string
	SourceTutoringRequestID string
	Status                  StudentAppAITutorResultArchiveStatus
	MaterialType            MaterialType
	RenderFormat            StudentAppAITutorResultArchiveRenderFormat
	Actions                 []StudentAppAITutorResultArchiveLearningAction
	FollowUpDepth           int
}

type StudentAppAITutorResultArchiveLearningAction struct {
	ActionType           StudentAppArchiveItemLearningActionType
	State                StudentAppArchiveItemLearningActionState
	TargetEndpoint       string
	Method               string
	QuestionBankIntent   QuestionBankIntent
	RequiresTutorRequest bool
	SourceType           StudentAppAITutorLearningActionSourceType
	FollowUpDepth        int
}

func BuildStudentAppAITutorResultArchiveLearningActions(
	input NormalizedReadStudentAppArchiveItemInput,
	rendered StudentAppAITutorResultArchiveRenderEnvelope,
) (StudentAppAITutorResultArchiveLearningActions, error) {
	if err := AuthorizeCreateStudentAppAITutorRequest(input.Principal); err != nil {
		return StudentAppAITutorResultArchiveLearningActions{}, err
	}
	if rendered.ArchiveItemID != input.ArchiveItemID ||
		rendered.Status != StudentAppAITutorResultArchiveStatusReady ||
		rendered.MaterialType != MaterialTypeHomework ||
		rendered.RenderFormat != StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks {
		return StudentAppAITutorResultArchiveLearningActions{}, ErrForbidden
	}
	if !hasAITutorResultArchiveRenderBlock(rendered.Blocks, StudentAppAITutorResultArchiveBlockTypeSummary) ||
		!hasAITutorResultArchiveRenderBlock(rendered.Blocks, StudentAppAITutorResultArchiveBlockTypeGuidanceSection) {
		return StudentAppAITutorResultArchiveLearningActions{}, ErrForbidden
	}
	followUpDepth, err := normalizeAITutorResultArchiveFollowUpDepth(rendered.FollowUpDepth)
	if err != nil {
		return StudentAppAITutorResultArchiveLearningActions{}, err
	}
	nextFollowUpDepth := followUpDepth + 1
	if nextFollowUpDepth > maxAITutorResultArchiveFollowUpDepth {
		return StudentAppAITutorResultArchiveLearningActions{
			ArchiveItemID:           rendered.ArchiveItemID,
			SourceArchiveItemID:     rendered.SourceArchiveItemID,
			SourceTutoringRequestID: rendered.SourceTutoringRequestID,
			Status:                  rendered.Status,
			MaterialType:            rendered.MaterialType,
			RenderFormat:            rendered.RenderFormat,
			FollowUpDepth:           followUpDepth,
		}, nil
	}
	return StudentAppAITutorResultArchiveLearningActions{
		ArchiveItemID:           rendered.ArchiveItemID,
		SourceArchiveItemID:     rendered.SourceArchiveItemID,
		SourceTutoringRequestID: rendered.SourceTutoringRequestID,
		Status:                  rendered.Status,
		MaterialType:            rendered.MaterialType,
		RenderFormat:            rendered.RenderFormat,
		FollowUpDepth:           followUpDepth,
		Actions: []StudentAppAITutorResultArchiveLearningAction{
			{
				ActionType:           StudentAppArchiveItemLearningActionAITutorRequest,
				State:                StudentAppArchiveItemLearningActionAvailable,
				TargetEndpoint:       "/v1/student-app/ai-tutor-requests",
				Method:               "POST",
				QuestionBankIntent:   QuestionBankIntentGeneratePersonalizedCheck,
				RequiresTutorRequest: true,
				SourceType:           StudentAppAITutorLearningActionSourceResultArchive,
				FollowUpDepth:        nextFollowUpDepth,
			},
			{
				ActionType:           StudentAppArchiveItemLearningActionPersonalizedQuestionBank,
				State:                StudentAppArchiveItemLearningActionDeferredThroughAITutor,
				TargetEndpoint:       "/v1/student-app/ai-tutor-requests",
				Method:               "POST",
				QuestionBankIntent:   QuestionBankIntentGeneratePersonalizedCheck,
				RequiresTutorRequest: true,
				SourceType:           StudentAppAITutorLearningActionSourceResultArchive,
				FollowUpDepth:        nextFollowUpDepth,
			},
		},
	}, nil
}

func hasAITutorResultArchiveRenderBlock(
	blocks []StudentAppAITutorResultArchiveRenderBlock,
	blockType StudentAppAITutorResultArchiveBlockType,
) bool {
	for _, block := range blocks {
		if block.BlockType == blockType {
			return true
		}
	}
	return false
}
