package domain

type QuestionBankDraftAnswerFeedbackLearningActions struct {
	SubmissionID          string
	ArchiveItemID         string
	FeedbackArchiveItemID string
	Status                StudentAppQuestionBankDraftAnswerFeedbackStatus
	MaterialType          MaterialType
	RenderFormat          QuestionBankDraftAnswerFeedbackRenderFormat
	Actions               []QuestionBankDraftAnswerFeedbackLearningAction
}

type QuestionBankDraftAnswerFeedbackLearningAction struct {
	ActionType           StudentAppArchiveItemLearningActionType
	State                StudentAppArchiveItemLearningActionState
	TargetEndpoint       string
	Method               string
	QuestionBankIntent   QuestionBankIntent
	RequiresTutorRequest bool
	SourceType           StudentAppAITutorLearningActionSourceType
}

func BuildQuestionBankDraftAnswerFeedbackLearningActions(
	input NormalizedReadStudentAppQuestionBankDraftAnswerFeedbackInput,
	rendered QuestionBankDraftAnswerFeedbackRenderEnvelope,
) (QuestionBankDraftAnswerFeedbackLearningActions, error) {
	if err := AuthorizeCreateStudentAppAITutorRequest(input.Principal); err != nil {
		return QuestionBankDraftAnswerFeedbackLearningActions{}, err
	}
	if rendered.SubmissionID != input.SubmissionID ||
		rendered.Status != StudentAppQuestionBankDraftAnswerFeedbackStatusReady ||
		rendered.MaterialType != MaterialTypeHomework ||
		rendered.RenderFormat != QuestionBankDraftAnswerFeedbackRenderFormatSafeTextBlocks {
		return QuestionBankDraftAnswerFeedbackLearningActions{}, ErrForbidden
	}
	if !hasQuestionBankDraftAnswerFeedbackBlock(rendered.Blocks, QuestionBankDraftAnswerFeedbackBlockTypeScoreSummary) ||
		!hasQuestionBankDraftAnswerFeedbackBlock(rendered.Blocks, QuestionBankDraftAnswerFeedbackBlockTypeNextStep) ||
		!hasQuestionBankDraftAnswerFeedbackBlock(rendered.Blocks, QuestionBankDraftAnswerFeedbackBlockTypePracticeSuggestion) {
		return QuestionBankDraftAnswerFeedbackLearningActions{}, ErrForbidden
	}
	return QuestionBankDraftAnswerFeedbackLearningActions{
		SubmissionID:          rendered.SubmissionID,
		ArchiveItemID:         rendered.ArchiveItemID,
		FeedbackArchiveItemID: rendered.FeedbackArchiveItemID,
		Status:                rendered.Status,
		MaterialType:          rendered.MaterialType,
		RenderFormat:          rendered.RenderFormat,
		Actions: []QuestionBankDraftAnswerFeedbackLearningAction{
			{
				ActionType:           StudentAppArchiveItemLearningActionAITutorRequest,
				State:                StudentAppArchiveItemLearningActionAvailable,
				TargetEndpoint:       "/v1/student-app/ai-tutor-requests",
				Method:               "POST",
				QuestionBankIntent:   QuestionBankIntentGeneratePersonalizedCheck,
				RequiresTutorRequest: true,
				SourceType:           StudentAppAITutorLearningActionSourceQuestionBankFeedback,
			},
			{
				ActionType:           StudentAppArchiveItemLearningActionPersonalizedQuestionBank,
				State:                StudentAppArchiveItemLearningActionDeferredThroughAITutor,
				TargetEndpoint:       "/v1/student-app/ai-tutor-requests",
				Method:               "POST",
				QuestionBankIntent:   QuestionBankIntentGeneratePersonalizedCheck,
				RequiresTutorRequest: true,
				SourceType:           StudentAppAITutorLearningActionSourceQuestionBankFeedback,
			},
		},
	}, nil
}

func hasQuestionBankDraftAnswerFeedbackBlock(
	blocks []QuestionBankDraftAnswerFeedbackRenderBlock,
	blockType QuestionBankDraftAnswerFeedbackBlockType,
) bool {
	for _, block := range blocks {
		if block.BlockType == blockType {
			return true
		}
	}
	return false
}
