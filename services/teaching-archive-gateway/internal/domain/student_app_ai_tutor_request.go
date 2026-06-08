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
	ActionType   StudentAppArchiveItemLearningActionType
	PacketStatus StudentAppArchiveItemStudyPacketStatus
}

func (source StudentAppAITutorLearningActionSource) IsZero() bool {
	return source.ActionType == "" && source.PacketStatus == ""
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
	if source.ActionType != StudentAppArchiveItemLearningActionAITutorRequest &&
		source.ActionType != StudentAppArchiveItemLearningActionPersonalizedQuestionBank {
		return StudentAppAITutorLearningActionSource{}, validationError("learningActionSource.actionType is unsupported")
	}
	if source.PacketStatus != StudentAppArchiveItemStudyPacketStatusReady {
		return StudentAppAITutorLearningActionSource{}, validationError("learningActionSource.packetStatus must be READY")
	}
	return source, nil
}
