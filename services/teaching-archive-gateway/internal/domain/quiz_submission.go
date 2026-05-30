package domain

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	maxQuizSubmissionIDLength = 200
	maxQuizAnswerRefLength    = 1000
)

type QuizSubmissionStatus string

const (
	QuizSubmissionStatusSubmitted QuizSubmissionStatus = "SUBMITTED"
)

type QuizSubmission struct {
	ID                     string
	QuizArchiveItemID      string
	StudentID              string
	SubmittedByPrincipalID string
	AnswerRef              string
	Status                 QuizSubmissionStatus
	SubmittedAt            time.Time
}

type CreateQuizSubmissionInput struct {
	Principal         PrincipalContext
	QuizArchiveItemID string
	StudentID         string
	AnswerRef         string
}

func NewQuizSubmission(
	id string,
	input CreateQuizSubmissionInput,
	submittedAt time.Time,
) (QuizSubmission, error) {
	normalized, err := NormalizeCreateQuizSubmissionInput(input)
	if err != nil {
		return QuizSubmission{}, err
	}
	if !strings.HasPrefix(id, "quiz_sub_") {
		return QuizSubmission{}, fmt.Errorf("generated quiz submission id must use quiz_sub_ prefix")
	}

	return QuizSubmission{
		ID:                     id,
		QuizArchiveItemID:      normalized.QuizArchiveItemID,
		StudentID:              normalized.StudentID,
		SubmittedByPrincipalID: strings.TrimSpace(normalized.Principal.PrincipalID),
		AnswerRef:              normalized.AnswerRef,
		Status:                 QuizSubmissionStatusSubmitted,
		SubmittedAt:            submittedAt.UTC(),
	}, nil
}

func NormalizeCreateQuizSubmissionInput(input CreateQuizSubmissionInput) (CreateQuizSubmissionInput, error) {
	quizArchiveItemID, err := NormalizeArchiveItemID(input.QuizArchiveItemID)
	if err != nil {
		return CreateQuizSubmissionInput{}, err
	}
	studentID, err := normalizeQuizSubmissionStudentID(input.Principal, input.StudentID)
	if err != nil {
		return CreateQuizSubmissionInput{}, err
	}
	answerRef, err := normalizeRequiredText(input.AnswerRef, maxQuizAnswerRefLength, "answerRef")
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

func ValidateQuizSubmissionArchiveItem(item ArchiveItem) error {
	if item.OwnerType != OwnerTypeTeaching || item.MaterialType != MaterialTypeQuiz {
		return validationError("quiz submission requires a teaching quiz archive item")
	}
	return nil
}

func AuthorizeCreateQuizSubmission(
	principal PrincipalContext,
	item ArchiveItem,
	studentID string,
) error {
	if err := ValidatePrincipalContext(principal); err != nil {
		return err
	}
	if err := ValidateQuizSubmissionArchiveItem(item); err != nil {
		return err
	}
	if err := AuthorizeReadArchiveItem(principal, item); err != nil {
		return err
	}
	if canWriteOwnStudentArchive(principal, studentID) || canWriteAssignedStudentArchive(principal, studentID) {
		return nil
	}
	return ErrForbidden
}

func NormalizeQuizSubmissionID(value string) (string, error) {
	normalized, err := normalizeRequiredText(value, maxQuizSubmissionIDLength, "submissionId")
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(normalized, "quiz_sub_") {
		return "", validationError("submissionId must use quiz_sub_ prefix")
	}
	return normalized, nil
}

func normalizeQuizSubmissionStudentID(principal PrincipalContext, value string) (string, error) {
	studentID := strings.TrimSpace(value)
	if studentID == "" && principal.StudentAccess.Mode == StudentAccessOwn {
		studentID = primaryOwnStudentID(principal)
	}
	if studentID == "" {
		return "", validationError("studentId is required")
	}
	if utf8.RuneCountInString(studentID) > maxArchiveStudentIDLength {
		return "", validationError("studentId is too long")
	}
	return studentID, nil
}
