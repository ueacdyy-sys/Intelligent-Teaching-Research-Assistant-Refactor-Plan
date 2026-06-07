package domain

import (
	"strings"
	"time"
	"unicode/utf8"
)

const (
	questionBankDraftRefPrefix               = "local://question-bank-drafts/"
	maxQuestionBankDraftContentItems         = 100
	maxQuestionBankDraftContentItemIDLength  = 128
	maxQuestionBankDraftQuestionTextLength   = 2000
	maxQuestionBankDraftAnswerLength         = 2000
	maxQuestionBankDraftExplanationLength    = 4000
	maxQuestionBankDraftLearningTargetLength = 200
)

type QuestionBankDraftContentStatus string

const (
	QuestionBankDraftContentStatusDraft QuestionBankDraftContentStatus = "DRAFT"
)

type ReadStudentAppQuestionBankDraftContentInput struct {
	Principal            PrincipalContext
	QuestionBankDraftRef string
}

type NormalizedReadStudentAppQuestionBankDraftContentInput struct {
	Principal            PrincipalContext
	QuestionBankDraftRef string
	StudentID            string
}

type QuestionBankDraftContent struct {
	QuestionBankDraftRef      string
	TutoringAnalysisRequestID string
	ArchiveItemID             string
	StudentID                 string
	Status                    QuestionBankDraftContentStatus
	SourceArchiveMaterial     MaterialType
	ResultSummary             string
	Items                     []QuestionBankDraftItem
	CreatedAt                 time.Time
	UpdatedAt                 time.Time
}

type QuestionBankDraftItem struct {
	ID             string `json:"id"`
	QuestionText   string `json:"questionText"`
	ExpectedAnswer string `json:"expectedAnswer"`
	Explanation    string `json:"explanation"`
	LearningTarget string `json:"learningTarget,omitempty"`
}

func NormalizeReadStudentAppQuestionBankDraftContentInput(
	input ReadStudentAppQuestionBankDraftContentInput,
) (NormalizedReadStudentAppQuestionBankDraftContentInput, error) {
	if err := AuthorizeListStudentAppQuestionBankDrafts(input.Principal); err != nil {
		return NormalizedReadStudentAppQuestionBankDraftContentInput{}, err
	}
	draftRef, err := NormalizeQuestionBankDraftRef(input.QuestionBankDraftRef)
	if err != nil {
		return NormalizedReadStudentAppQuestionBankDraftContentInput{}, err
	}
	studentID := primaryOwnStudentID(input.Principal)
	if studentID == "" {
		return NormalizedReadStudentAppQuestionBankDraftContentInput{}, ErrForbidden
	}
	return NormalizedReadStudentAppQuestionBankDraftContentInput{
		Principal:            input.Principal,
		QuestionBankDraftRef: draftRef,
		StudentID:            studentID,
	}, nil
}

func NormalizeQuestionBankDraftContent(
	content QuestionBankDraftContent,
) (QuestionBankDraftContent, error) {
	draftRef, err := NormalizeQuestionBankDraftRef(content.QuestionBankDraftRef)
	if err != nil {
		return QuestionBankDraftContent{}, err
	}
	requestID, err := NormalizeTutoringAnalysisRequestID(content.TutoringAnalysisRequestID)
	if err != nil {
		return QuestionBankDraftContent{}, err
	}
	if draftRef != questionBankDraftRefPrefix+requestID+".json" {
		return QuestionBankDraftContent{}, validationError("questionBankDraftRef must match tutoringAnalysisRequestId")
	}
	archiveItemID, err := NormalizeArchiveItemID(content.ArchiveItemID)
	if err != nil {
		return QuestionBankDraftContent{}, err
	}
	if !strings.HasPrefix(archiveItemID, "tarch_") {
		return QuestionBankDraftContent{}, validationError("archiveItemId must use tarch_ prefix")
	}
	studentID, err := normalizeRequiredText(content.StudentID, maxArchiveStudentIDLength, "studentId")
	if err != nil {
		return QuestionBankDraftContent{}, err
	}
	status := content.Status
	if status == "" {
		status = QuestionBankDraftContentStatusDraft
	}
	if status != QuestionBankDraftContentStatusDraft {
		return QuestionBankDraftContent{}, validationError("question bank draft content status is unsupported")
	}
	if !validMaterialType(content.SourceArchiveMaterial) {
		return QuestionBankDraftContent{}, validationError("sourceArchiveMaterial is unsupported")
	}
	resultSummary, err := normalizeRequiredText(
		content.ResultSummary,
		maxTutoringAnalysisResultSummaryLength,
		"resultSummary",
	)
	if err != nil {
		return QuestionBankDraftContent{}, err
	}
	items, err := normalizeQuestionBankDraftItems(content.Items)
	if err != nil {
		return QuestionBankDraftContent{}, err
	}
	if content.CreatedAt.IsZero() || content.UpdatedAt.IsZero() {
		return QuestionBankDraftContent{}, validationError("question bank draft content timestamps are required")
	}
	return QuestionBankDraftContent{
		QuestionBankDraftRef:      draftRef,
		TutoringAnalysisRequestID: requestID,
		ArchiveItemID:             archiveItemID,
		StudentID:                 studentID,
		Status:                    status,
		SourceArchiveMaterial:     content.SourceArchiveMaterial,
		ResultSummary:             resultSummary,
		Items:                     items,
		CreatedAt:                 content.CreatedAt.UTC(),
		UpdatedAt:                 content.UpdatedAt.UTC(),
	}, nil
}

func BuildStudentAppQuestionBankDraftContent(
	input NormalizedReadStudentAppQuestionBankDraftContentInput,
	content QuestionBankDraftContent,
) (QuestionBankDraftContent, error) {
	normalized, err := NormalizeQuestionBankDraftContent(content)
	if err != nil {
		return QuestionBankDraftContent{}, err
	}
	if normalized.QuestionBankDraftRef != input.QuestionBankDraftRef ||
		normalized.StudentID != input.StudentID ||
		normalized.Status != QuestionBankDraftContentStatusDraft {
		return QuestionBankDraftContent{}, ErrForbidden
	}
	return normalized, nil
}

func NormalizeQuestionBankDraftRef(value string) (string, error) {
	normalized, err := normalizeRequiredText(value, maxTutoringAnalysisResultRefLength, "questionBankDraftRef")
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(normalized, questionBankDraftRefPrefix) ||
		!strings.HasSuffix(normalized, ".json") ||
		strings.ContainsAny(normalized, " \t\r\n") {
		return "", validationError("questionBankDraftRef must use local question-bank draft json scheme")
	}
	return normalized, nil
}

func normalizeQuestionBankDraftItems(items []QuestionBankDraftItem) ([]QuestionBankDraftItem, error) {
	if len(items) == 0 {
		return nil, validationError("question bank draft content requires at least one item")
	}
	if len(items) > maxQuestionBankDraftContentItems {
		return nil, validationError("too many question bank draft items")
	}
	normalized := make([]QuestionBankDraftItem, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		normalizedItem, err := normalizeQuestionBankDraftItem(item)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[normalizedItem.ID]; ok {
			return nil, validationError("question bank draft item id is duplicated")
		}
		seen[normalizedItem.ID] = struct{}{}
		normalized = append(normalized, normalizedItem)
	}
	return normalized, nil
}

func normalizeQuestionBankDraftItem(item QuestionBankDraftItem) (QuestionBankDraftItem, error) {
	id, err := normalizeRequiredText(item.ID, maxQuestionBankDraftContentItemIDLength, "itemId")
	if err != nil {
		return QuestionBankDraftItem{}, err
	}
	questionText, err := normalizeRequiredText(item.QuestionText, maxQuestionBankDraftQuestionTextLength, "questionText")
	if err != nil {
		return QuestionBankDraftItem{}, err
	}
	expectedAnswer, err := normalizeRequiredText(item.ExpectedAnswer, maxQuestionBankDraftAnswerLength, "expectedAnswer")
	if err != nil {
		return QuestionBankDraftItem{}, err
	}
	explanation, err := normalizeRequiredText(item.Explanation, maxQuestionBankDraftExplanationLength, "explanation")
	if err != nil {
		return QuestionBankDraftItem{}, err
	}
	learningTarget, err := normalizeOptionalQuestionBankText(
		item.LearningTarget,
		maxQuestionBankDraftLearningTargetLength,
		"learningTarget",
	)
	if err != nil {
		return QuestionBankDraftItem{}, err
	}
	return QuestionBankDraftItem{
		ID:             id,
		QuestionText:   questionText,
		ExpectedAnswer: expectedAnswer,
		Explanation:    explanation,
		LearningTarget: learningTarget,
	}, nil
}

func normalizeOptionalQuestionBankText(value string, maxLength int, field string) (string, error) {
	normalized := strings.TrimSpace(value)
	if normalized == "" {
		return "", nil
	}
	if utf8.RuneCountInString(normalized) > maxLength {
		return "", validationError(field + " is too long")
	}
	return normalized, nil
}
