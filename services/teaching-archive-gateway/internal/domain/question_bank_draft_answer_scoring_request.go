package domain

type CreateStudentAppQuestionBankDraftAnswerScoringRequestInput struct {
	Principal           PrincipalContext
	SubmissionID        string
	GradingInstructions string
	RubricRef           string
}

type NormalizedCreateStudentAppQuestionBankDraftAnswerScoringRequestInput struct {
	Principal           PrincipalContext
	SubmissionID        string
	StudentID           string
	GradingInstructions string
	RubricRef           string
}

func NormalizeCreateStudentAppQuestionBankDraftAnswerScoringRequestInput(
	input CreateStudentAppQuestionBankDraftAnswerScoringRequestInput,
) (NormalizedCreateStudentAppQuestionBankDraftAnswerScoringRequestInput, error) {
	if err := AuthorizeListStudentAppQuestionBankDrafts(input.Principal); err != nil {
		return NormalizedCreateStudentAppQuestionBankDraftAnswerScoringRequestInput{}, err
	}
	if err := requireScope(input.Principal, ScopeStudentOwnWrite); err != nil {
		return NormalizedCreateStudentAppQuestionBankDraftAnswerScoringRequestInput{}, err
	}
	submissionID, err := NormalizeQuestionBankDraftAnswerSubmissionID(input.SubmissionID)
	if err != nil {
		return NormalizedCreateStudentAppQuestionBankDraftAnswerScoringRequestInput{}, err
	}
	studentID := primaryOwnStudentID(input.Principal)
	if studentID == "" {
		return NormalizedCreateStudentAppQuestionBankDraftAnswerScoringRequestInput{}, ErrForbidden
	}
	return NormalizedCreateStudentAppQuestionBankDraftAnswerScoringRequestInput{
		Principal:           input.Principal,
		SubmissionID:        submissionID,
		StudentID:           studentID,
		GradingInstructions: input.GradingInstructions,
		RubricRef:           input.RubricRef,
	}, nil
}

func ValidateQuestionBankDraftAnswerScoringSource(
	input NormalizedCreateStudentAppQuestionBankDraftAnswerScoringRequestInput,
	submission QuestionBankDraftAnswerSubmission,
	content QuestionBankDraftContent,
) error {
	if submission.ID != input.SubmissionID || submission.StudentID != input.StudentID {
		return ErrForbidden
	}
	normalizedContent, err := BuildStudentAppQuestionBankDraftContent(
		NormalizedReadStudentAppQuestionBankDraftContentInput{
			Principal:            input.Principal,
			QuestionBankDraftRef: submission.QuestionBankDraftRef,
			StudentID:            input.StudentID,
		},
		content,
	)
	if err != nil {
		return err
	}
	if submission.QuestionBankDraftRef != normalizedContent.QuestionBankDraftRef ||
		submission.TutoringAnalysisRequestID != normalizedContent.TutoringAnalysisRequestID ||
		submission.ArchiveItemID != normalizedContent.ArchiveItemID {
		return validationError("question bank answer submission does not match draft content")
	}
	if err := validateSubmittedAnswersAgainstDraft(submission.Answers, normalizedContent); err != nil {
		return err
	}
	return nil
}
