package domain

import "strings"

type CreateQuizSubmissionAIGradingRequestInput struct {
	Principal           PrincipalContext
	QuizArchiveItemID   string
	SubmissionID        string
	GradingInstructions string
	RubricRef           string
}

func NormalizeCreateQuizSubmissionAIGradingRequestInput(
	input CreateQuizSubmissionAIGradingRequestInput,
) (CreateQuizSubmissionAIGradingRequestInput, error) {
	quizArchiveItemID, err := NormalizeArchiveItemID(input.QuizArchiveItemID)
	if err != nil {
		return CreateQuizSubmissionAIGradingRequestInput{}, err
	}
	submissionID, err := NormalizeQuizSubmissionID(input.SubmissionID)
	if err != nil {
		return CreateQuizSubmissionAIGradingRequestInput{}, err
	}
	return CreateQuizSubmissionAIGradingRequestInput{
		Principal:           input.Principal,
		QuizArchiveItemID:   quizArchiveItemID,
		SubmissionID:        submissionID,
		GradingInstructions: input.GradingInstructions,
		RubricRef:           input.RubricRef,
	}, nil
}

func AuthorizeCreateQuizSubmissionAIGradingRequest(
	principal PrincipalContext,
	item ArchiveItem,
	submission QuizSubmission,
) error {
	if err := ValidatePrincipalContext(principal); err != nil {
		return err
	}
	if err := ValidateQuizSubmissionArchiveItem(item); err != nil {
		return err
	}
	if err := ValidateQuizSubmissionAIGradingSource(item, submission); err != nil {
		return err
	}
	if err := AuthorizeReadArchiveItem(principal, item); err != nil {
		return err
	}
	if canWriteOwnStudentArchive(principal, submission.StudentID) ||
		canWriteAssignedStudentArchive(principal, submission.StudentID) {
		return nil
	}
	return ErrForbidden
}

func ValidateQuizSubmissionAIGradingSource(item ArchiveItem, submission QuizSubmission) error {
	if strings.TrimSpace(submission.ID) == "" {
		return validationError("submissionId is required")
	}
	if strings.TrimSpace(submission.QuizArchiveItemID) != item.ID {
		return validationError("quiz submission does not belong to archive item")
	}
	if strings.TrimSpace(submission.StudentID) == "" {
		return validationError("quiz submission studentId is required")
	}
	if strings.TrimSpace(submission.AnswerRef) == "" {
		return validationError("quiz submission answerRef is required")
	}
	return nil
}
