package domain

type CreateStudentAppAITutorRequestInput struct {
	Principal            PrincipalContext
	StudentArchiveItemID string
	AnalysisGoal         string
	QuestionBankIntent   QuestionBankIntent
	LearningActionSource StudentAppAITutorLearningActionSource
}

type NormalizedCreateStudentAppAITutorRequestInput struct {
	Principal            PrincipalContext
	ArchiveItemID        string
	StudentID            string
	AnalysisGoal         string
	QuestionBankIntent   QuestionBankIntent
	LearningActionSource StudentAppAITutorLearningActionSource
}

type StudentAppAITutorLearningActionSource struct {
	SourceType          StudentAppAITutorLearningActionSourceType
	ActionType          StudentAppArchiveItemLearningActionType
	PacketStatus        StudentAppArchiveItemStudyPacketStatus
	ResultArchiveStatus StudentAppAITutorResultArchiveStatus
	RenderFormat        StudentAppAITutorResultArchiveRenderFormat
	FollowUpDepth       int
}

func (source StudentAppAITutorLearningActionSource) IsZero() bool {
	return source.SourceType == "" &&
		source.ActionType == "" &&
		source.PacketStatus == "" &&
		source.ResultArchiveStatus == "" &&
		source.RenderFormat == "" &&
		source.FollowUpDepth == 0
}

type StudentAppAITutorLearningActionSourceType string

const (
	StudentAppAITutorLearningActionSourcePublishedStudyPacket StudentAppAITutorLearningActionSourceType = "PUBLISHED_STUDY_PACKET"
	StudentAppAITutorLearningActionSourceResultArchive        StudentAppAITutorLearningActionSourceType = "AI_TUTOR_RESULT_ARCHIVE"
)

func validStudentAppAITutorLearningActionSourceType(value StudentAppAITutorLearningActionSourceType) bool {
	return value == StudentAppAITutorLearningActionSourcePublishedStudyPacket ||
		value == StudentAppAITutorLearningActionSourceResultArchive
}

func NormalizeCreateStudentAppAITutorRequestInput(
	input CreateStudentAppAITutorRequestInput,
) (NormalizedCreateStudentAppAITutorRequestInput, error) {
	if err := AuthorizeCreateStudentAppAITutorRequest(input.Principal); err != nil {
		return NormalizedCreateStudentAppAITutorRequestInput{}, err
	}
	archiveItemID, err := NormalizeArchiveItemID(input.StudentArchiveItemID)
	if err != nil {
		return NormalizedCreateStudentAppAITutorRequestInput{}, err
	}
	analysisGoal, err := normalizeRequiredText(input.AnalysisGoal, maxTutoringAnalysisGoalLength, "analysisGoal")
	if err != nil {
		return NormalizedCreateStudentAppAITutorRequestInput{}, err
	}
	questionBankIntent := input.QuestionBankIntent
	if questionBankIntent == "" {
		questionBankIntent = QuestionBankIntentGeneratePersonalizedCheck
	}
	if !validQuestionBankIntent(questionBankIntent) {
		return NormalizedCreateStudentAppAITutorRequestInput{}, validationError("questionBankIntent is unsupported")
	}
	learningActionSource, err := normalizeStudentAppAITutorLearningActionSource(input.LearningActionSource)
	if err != nil {
		return NormalizedCreateStudentAppAITutorRequestInput{}, err
	}
	return NormalizedCreateStudentAppAITutorRequestInput{
		Principal:            input.Principal,
		ArchiveItemID:        archiveItemID,
		StudentID:            primaryOwnStudentID(input.Principal),
		AnalysisGoal:         analysisGoal,
		QuestionBankIntent:   questionBankIntent,
		LearningActionSource: learningActionSource,
	}, nil
}

func AuthorizeCreateStudentAppAITutorRequest(principal PrincipalContext) error {
	if err := ValidatePrincipalContext(principal); err != nil {
		return err
	}
	if err := requireScope(principal, ScopeTeachingRead); err != nil {
		return err
	}
	if err := requireScope(principal, ScopeStudentOwnRead); err != nil {
		return err
	}
	if principal.SubjectType != SubjectUser ||
		principal.Role != RoleStudent ||
		principal.EntryPoint != EntryPointStudentApp ||
		principal.StudentAccess.Mode != StudentAccessOwn ||
		primaryOwnStudentID(principal) == "" {
		return ErrForbidden
	}
	return nil
}

func normalizeStudentAppAITutorLearningActionSource(
	source StudentAppAITutorLearningActionSource,
) (StudentAppAITutorLearningActionSource, error) {
	if source.IsZero() {
		return StudentAppAITutorLearningActionSource{}, nil
	}
	sourceType := source.SourceType
	if sourceType == "" {
		sourceType = StudentAppAITutorLearningActionSourcePublishedStudyPacket
	}
	if source.ActionType != StudentAppArchiveItemLearningActionAITutorRequest &&
		source.ActionType != StudentAppArchiveItemLearningActionPersonalizedQuestionBank {
		return StudentAppAITutorLearningActionSource{}, validationError("learningActionSource.actionType is unsupported")
	}
	switch sourceType {
	case StudentAppAITutorLearningActionSourcePublishedStudyPacket:
		if source.PacketStatus != StudentAppArchiveItemStudyPacketStatusReady {
			return StudentAppAITutorLearningActionSource{}, validationError("learningActionSource.packetStatus must be READY")
		}
		if source.ResultArchiveStatus != "" || source.RenderFormat != "" {
			return StudentAppAITutorLearningActionSource{}, validationError("learningActionSource result archive fields are unsupported for published study packet")
		}
		if source.FollowUpDepth != 0 {
			return StudentAppAITutorLearningActionSource{}, validationError("learningActionSource.followUpDepth is unsupported for published study packet")
		}
		return StudentAppAITutorLearningActionSource{
			SourceType:   sourceType,
			ActionType:   source.ActionType,
			PacketStatus: source.PacketStatus,
		}, nil
	case StudentAppAITutorLearningActionSourceResultArchive:
		if source.ResultArchiveStatus != StudentAppAITutorResultArchiveStatusReady {
			return StudentAppAITutorLearningActionSource{}, validationError("learningActionSource.resultArchiveStatus must be READY_FOR_STUDENT_APP_READ")
		}
		if source.RenderFormat != StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks {
			return StudentAppAITutorLearningActionSource{}, validationError("learningActionSource.renderFormat must be SAFE_TEXT_BLOCKS")
		}
		if source.PacketStatus != "" {
			return StudentAppAITutorLearningActionSource{}, validationError("learningActionSource.packetStatus is unsupported for AI Tutor result archive")
		}
		followUpDepth, err := normalizeAITutorResultArchiveNextFollowUpDepth(source.FollowUpDepth)
		if err != nil {
			return StudentAppAITutorLearningActionSource{}, err
		}
		return StudentAppAITutorLearningActionSource{
			SourceType:          sourceType,
			ActionType:          source.ActionType,
			ResultArchiveStatus: source.ResultArchiveStatus,
			RenderFormat:        source.RenderFormat,
			FollowUpDepth:       followUpDepth,
		}, nil
	default:
		return StudentAppAITutorLearningActionSource{}, validationError("learningActionSource.sourceType is unsupported")
	}
}
