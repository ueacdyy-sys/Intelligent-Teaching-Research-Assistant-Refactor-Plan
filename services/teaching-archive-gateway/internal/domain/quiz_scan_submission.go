package domain

import "strings"

const (
	quizScanCodePrefix    = "teaching-quiz:"
	maxQuizScanCodeLength = 256
)

type CreateScannedQuizSubmissionInput struct {
	Principal PrincipalContext
	ScanCode  string
	AnswerRef string
}

func ResolveQuizScanCode(value string) (string, error) {
	scanCode, err := normalizeRequiredText(value, maxQuizScanCodeLength, "scanCode")
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(scanCode, quizScanCodePrefix) {
		return "", validationError("scanCode must use teaching-quiz scheme")
	}
	return NormalizeArchiveItemID(strings.TrimPrefix(scanCode, quizScanCodePrefix))
}

func NormalizeCreateScannedQuizSubmissionInput(
	input CreateScannedQuizSubmissionInput,
) (CreateQuizSubmissionInput, error) {
	if err := AuthorizeCreateScannedQuizSubmission(input.Principal); err != nil {
		return CreateQuizSubmissionInput{}, err
	}
	quizArchiveItemID, err := ResolveQuizScanCode(input.ScanCode)
	if err != nil {
		return CreateQuizSubmissionInput{}, err
	}
	answerRef, err := normalizeRequiredText(input.AnswerRef, maxQuizAnswerRefLength, "answerRef")
	if err != nil {
		return CreateQuizSubmissionInput{}, err
	}
	studentID, err := normalizeQuizSubmissionStudentID(input.Principal, "")
	if err != nil {
		return CreateQuizSubmissionInput{}, err
	}
	return CreateQuizSubmissionInput{
		Principal:         input.Principal,
		QuizArchiveItemID: quizArchiveItemID,
		StudentID:         studentID,
		AnswerRef:         answerRef,
	}, nil
}

func AuthorizeCreateScannedQuizSubmission(principal PrincipalContext) error {
	if err := ValidatePrincipalContext(principal); err != nil {
		return err
	}
	if err := requireScope(principal, ScopeTeachingRead); err != nil {
		return err
	}
	if err := requireScope(principal, ScopeStudentOwnWrite); err != nil {
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
