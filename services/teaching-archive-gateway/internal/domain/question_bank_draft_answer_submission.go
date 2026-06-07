package domain

import (
	"strings"
	"time"
	"unicode/utf8"
)

const (
	maxQuestionBankDraftAnswerSubmissionIDLength = 200
	maxQuestionBankDraftSubmittedAnswerLength    = 4000
)

type QuestionBankDraftAnswerSubmissionStatus string

const (
	QuestionBankDraftAnswerSubmissionStatusSubmitted QuestionBankDraftAnswerSubmissionStatus = "SUBMITTED"
)

type SubmitStudentAppQuestionBankDraftAnswerInput struct {
	Principal            PrincipalContext
	QuestionBankDraftRef string
	Answers              []QuestionBankDraftSubmittedAnswer
}

type NormalizedSubmitStudentAppQuestionBankDraftAnswerInput struct {
	Principal            PrincipalContext
	QuestionBankDraftRef string
	StudentID            string
	Answers              []QuestionBankDraftSubmittedAnswer
}

type QuestionBankDraftAnswerSubmission struct {
	ID                        string
	QuestionBankDraftRef      string
	TutoringAnalysisRequestID string
	ArchiveItemID             string
	StudentID                 string
	SubmittedByPrincipalID    string
	Status                    QuestionBankDraftAnswerSubmissionStatus
	Answers                   []QuestionBankDraftSubmittedAnswer
	SubmittedAt               time.Time
}

type QuestionBankDraftSubmittedAnswer struct {
	ItemID     string `json:"itemId"`
	AnswerText string `json:"answerText"`
}

func NormalizeSubmitStudentAppQuestionBankDraftAnswerInput(
	input SubmitStudentAppQuestionBankDraftAnswerInput,
) (NormalizedSubmitStudentAppQuestionBankDraftAnswerInput, error) {
	if err := AuthorizeListStudentAppQuestionBankDrafts(input.Principal); err != nil {
		return NormalizedSubmitStudentAppQuestionBankDraftAnswerInput{}, err
	}
	if err := requireScope(input.Principal, ScopeStudentOwnWrite); err != nil {
		return NormalizedSubmitStudentAppQuestionBankDraftAnswerInput{}, err
	}
	draftRef, err := NormalizeQuestionBankDraftRef(input.QuestionBankDraftRef)
	if err != nil {
		return NormalizedSubmitStudentAppQuestionBankDraftAnswerInput{}, err
	}
	studentID := primaryOwnStudentID(input.Principal)
	if studentID == "" {
		return NormalizedSubmitStudentAppQuestionBankDraftAnswerInput{}, ErrForbidden
	}
	answers, err := normalizeQuestionBankDraftSubmittedAnswers(input.Answers)
	if err != nil {
		return NormalizedSubmitStudentAppQuestionBankDraftAnswerInput{}, err
	}
	return NormalizedSubmitStudentAppQuestionBankDraftAnswerInput{
		Principal:            input.Principal,
		QuestionBankDraftRef: draftRef,
		StudentID:            studentID,
		Answers:              answers,
	}, nil
}

func NewQuestionBankDraftAnswerSubmission(
	id string,
	input NormalizedSubmitStudentAppQuestionBankDraftAnswerInput,
	content QuestionBankDraftContent,
	submittedAt time.Time,
) (QuestionBankDraftAnswerSubmission, error) {
	normalizedID, err := NormalizeQuestionBankDraftAnswerSubmissionID(id)
	if err != nil {
		return QuestionBankDraftAnswerSubmission{}, err
	}
	normalizedContent, err := BuildStudentAppQuestionBankDraftContent(
		NormalizedReadStudentAppQuestionBankDraftContentInput{
			Principal:            input.Principal,
			QuestionBankDraftRef: input.QuestionBankDraftRef,
			StudentID:            input.StudentID,
		},
		content,
	)
	if err != nil {
		return QuestionBankDraftAnswerSubmission{}, err
	}
	if err := validateSubmittedAnswersAgainstDraft(input.Answers, normalizedContent); err != nil {
		return QuestionBankDraftAnswerSubmission{}, err
	}
	return QuestionBankDraftAnswerSubmission{
		ID:                        normalizedID,
		QuestionBankDraftRef:      normalizedContent.QuestionBankDraftRef,
		TutoringAnalysisRequestID: normalizedContent.TutoringAnalysisRequestID,
		ArchiveItemID:             normalizedContent.ArchiveItemID,
		StudentID:                 normalizedContent.StudentID,
		SubmittedByPrincipalID:    strings.TrimSpace(input.Principal.PrincipalID),
		Status:                    QuestionBankDraftAnswerSubmissionStatusSubmitted,
		Answers:                   append([]QuestionBankDraftSubmittedAnswer(nil), input.Answers...),
		SubmittedAt:               submittedAt.UTC(),
	}, nil
}

func NormalizeQuestionBankDraftAnswerSubmissionID(value string) (string, error) {
	normalized, err := normalizeRequiredText(value, maxQuestionBankDraftAnswerSubmissionIDLength, "submissionId")
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(normalized, "qbank_ans_sub_") {
		return "", validationError("submissionId must use qbank_ans_sub_ prefix")
	}
	return normalized, nil
}

func normalizeQuestionBankDraftSubmittedAnswers(
	answers []QuestionBankDraftSubmittedAnswer,
) ([]QuestionBankDraftSubmittedAnswer, error) {
	if len(answers) == 0 {
		return nil, validationError("answers must contain at least one item")
	}
	if len(answers) > maxQuestionBankDraftContentItems {
		return nil, validationError("too many answers")
	}
	normalized := make([]QuestionBankDraftSubmittedAnswer, 0, len(answers))
	seen := map[string]struct{}{}
	for _, answer := range answers {
		itemID, err := normalizeRequiredText(answer.ItemID, maxQuestionBankDraftContentItemIDLength, "itemId")
		if err != nil {
			return nil, err
		}
		if _, ok := seen[itemID]; ok {
			return nil, validationError("answer itemId is duplicated")
		}
		seen[itemID] = struct{}{}
		answerText := strings.TrimSpace(answer.AnswerText)
		if utf8.RuneCountInString(answerText) > maxQuestionBankDraftSubmittedAnswerLength {
			return nil, validationError("answerText is too long")
		}
		normalized = append(normalized, QuestionBankDraftSubmittedAnswer{
			ItemID:     itemID,
			AnswerText: answerText,
		})
	}
	return normalized, nil
}

func validateSubmittedAnswersAgainstDraft(
	answers []QuestionBankDraftSubmittedAnswer,
	content QuestionBankDraftContent,
) error {
	itemIDs := map[string]struct{}{}
	for _, item := range content.Items {
		itemIDs[item.ID] = struct{}{}
	}
	for _, answer := range answers {
		if _, ok := itemIDs[answer.ItemID]; !ok {
			return validationError("answer itemId is not in the question bank draft")
		}
	}
	return nil
}
