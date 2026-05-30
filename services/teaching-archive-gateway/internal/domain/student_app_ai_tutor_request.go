package domain

type CreateStudentAppAITutorRequestInput struct {
	Principal            PrincipalContext
	StudentArchiveItemID string
	AnalysisGoal         string
	QuestionBankIntent   QuestionBankIntent
}

type NormalizedCreateStudentAppAITutorRequestInput struct {
	Principal          PrincipalContext
	ArchiveItemID      string
	AnalysisGoal       string
	QuestionBankIntent QuestionBankIntent
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
	return NormalizedCreateStudentAppAITutorRequestInput{
		Principal:          input.Principal,
		ArchiveItemID:      archiveItemID,
		AnalysisGoal:       analysisGoal,
		QuestionBankIntent: questionBankIntent,
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
