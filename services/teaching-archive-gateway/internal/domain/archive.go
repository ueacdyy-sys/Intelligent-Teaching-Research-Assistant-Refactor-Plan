package domain

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	maxArchiveTitleLength      = 200
	maxArchiveStudentIDLength  = 128
	maxArchiveContentRefLength = 1000
	maxArchiveTagLength        = 64
	maxArchiveTags             = 32
	maxArchiveIntents          = 8
)

var ErrValidation = errors.New("archive item validation failed")

type OwnerType string

const (
	OwnerTypeStudent  OwnerType = "STUDENT"
	OwnerTypeTeaching OwnerType = "TEACHING"
)

type MaterialType string

const (
	MaterialTypeQuiz             MaterialType = "QUIZ"
	MaterialTypePaper            MaterialType = "PAPER"
	MaterialTypeHandout          MaterialType = "HANDOUT"
	MaterialTypeHomework         MaterialType = "HOMEWORK"
	MaterialTypeTeachingMaterial MaterialType = "TEACHING_MATERIAL"
)

type Source string

const (
	SourceTeacherUpload Source = "TEACHER_UPLOAD"
	SourceStudentUpload Source = "STUDENT_UPLOAD"
	SourceSystemImport  Source = "SYSTEM_IMPORT"
)

type AnalysisIntent string

const (
	AnalysisIntentTutoring    AnalysisIntent = "TUTORING"
	AnalysisIntentAIGrading   AnalysisIntent = "AI_GRADING"
	AnalysisIntentArchiveOnly AnalysisIntent = "ARCHIVE_ONLY"
)

type OCRStatus string

const (
	OCRStatusReserved    OCRStatus = "RESERVED"
	OCRStatusNotRequired OCRStatus = "NOT_REQUIRED"
)

type ArchiveItem struct {
	ID              string
	OwnerType       OwnerType
	StudentID       string
	MaterialType    MaterialType
	Title           string
	Source          Source
	ContentRef      string
	Tags            []string
	AnalysisIntents []AnalysisIntent
	OCRStatus       OCRStatus
	CreatedAt       time.Time
}

type CreateArchiveItemInput struct {
	Principal       PrincipalContext
	OwnerType       OwnerType
	StudentID       string
	MaterialType    MaterialType
	Title           string
	Source          Source
	ContentRef      string
	Tags            []string
	AnalysisIntents []AnalysisIntent
	OCRReserved     bool
}

func NewArchiveItem(id string, input CreateArchiveItemInput, createdAt time.Time) (ArchiveItem, error) {
	normalized, ocrStatus, err := NormalizeCreateArchiveItemInput(input)
	if err != nil {
		return ArchiveItem{}, err
	}
	return ArchiveItem{
		ID:              id,
		OwnerType:       normalized.OwnerType,
		StudentID:       normalized.StudentID,
		MaterialType:    normalized.MaterialType,
		Title:           normalized.Title,
		Source:          normalized.Source,
		ContentRef:      normalized.ContentRef,
		Tags:            normalized.Tags,
		AnalysisIntents: normalized.AnalysisIntents,
		OCRStatus:       ocrStatus,
		CreatedAt:       createdAt.UTC(),
	}, nil
}

func NormalizeCreateArchiveItemInput(input CreateArchiveItemInput) (CreateArchiveItemInput, OCRStatus, error) {
	if !validOwnerType(input.OwnerType) {
		return CreateArchiveItemInput{}, "", validationError("ownerType is unsupported")
	}
	if !validMaterialType(input.MaterialType) {
		return CreateArchiveItemInput{}, "", validationError("materialType is unsupported")
	}
	if !validSource(input.Source) {
		return CreateArchiveItemInput{}, "", validationError("source is unsupported")
	}

	studentID := strings.TrimSpace(input.StudentID)
	if input.OwnerType == OwnerTypeStudent && studentID == "" {
		return CreateArchiveItemInput{}, "", validationError("studentId is required for student archive items")
	}
	if utf8.RuneCountInString(studentID) > maxArchiveStudentIDLength {
		return CreateArchiveItemInput{}, "", validationError("studentId is too long")
	}

	title, err := normalizeRequiredText(input.Title, maxArchiveTitleLength, "title")
	if err != nil {
		return CreateArchiveItemInput{}, "", err
	}
	contentRef, err := normalizeRequiredText(input.ContentRef, maxArchiveContentRefLength, "contentRef")
	if err != nil {
		return CreateArchiveItemInput{}, "", err
	}
	tags, err := normalizeTags(input.Tags)
	if err != nil {
		return CreateArchiveItemInput{}, "", err
	}
	intents, hasAIGrading, err := normalizeAnalysisIntents(input.AnalysisIntents)
	if err != nil {
		return CreateArchiveItemInput{}, "", err
	}

	ocrStatus := OCRStatusNotRequired
	if input.OCRReserved || hasAIGrading {
		ocrStatus = OCRStatusReserved
	}

	return CreateArchiveItemInput{
		Principal:       input.Principal,
		OwnerType:       input.OwnerType,
		StudentID:       studentID,
		MaterialType:    input.MaterialType,
		Title:           title,
		Source:          input.Source,
		ContentRef:      contentRef,
		Tags:            tags,
		AnalysisIntents: intents,
		OCRReserved:     input.OCRReserved,
	}, ocrStatus, nil
}

func normalizeRequiredText(value string, maxLength int, field string) (string, error) {
	normalized := strings.TrimSpace(value)
	if normalized == "" {
		return "", validationError(field + " is required")
	}
	if utf8.RuneCountInString(normalized) > maxLength {
		return "", validationError(field + " is too long")
	}
	return normalized, nil
}

func normalizeTags(tags []string) ([]string, error) {
	if len(tags) > maxArchiveTags {
		return nil, validationError("too many tags")
	}
	normalized := make([]string, 0, len(tags))
	for _, tag := range tags {
		item := strings.TrimSpace(tag)
		if item == "" {
			return nil, validationError("tag is required")
		}
		if utf8.RuneCountInString(item) > maxArchiveTagLength {
			return nil, validationError("tag is too long")
		}
		normalized = append(normalized, item)
	}
	return normalized, nil
}

func normalizeAnalysisIntents(intents []AnalysisIntent) ([]AnalysisIntent, bool, error) {
	if len(intents) == 0 {
		return nil, false, validationError("analysisIntents must contain at least one item")
	}
	if len(intents) > maxArchiveIntents {
		return nil, false, validationError("too many analysisIntents")
	}
	normalized := make([]AnalysisIntent, 0, len(intents))
	hasAIGrading := false
	for _, intent := range intents {
		if !validAnalysisIntent(intent) {
			return nil, false, validationError("analysisIntent is unsupported")
		}
		if intent == AnalysisIntentAIGrading {
			hasAIGrading = true
		}
		normalized = append(normalized, intent)
	}
	return normalized, hasAIGrading, nil
}

func validOwnerType(value OwnerType) bool {
	return value == OwnerTypeStudent || value == OwnerTypeTeaching
}

func validMaterialType(value MaterialType) bool {
	switch value {
	case MaterialTypeQuiz, MaterialTypePaper, MaterialTypeHandout, MaterialTypeHomework, MaterialTypeTeachingMaterial:
		return true
	default:
		return false
	}
}

func validSource(value Source) bool {
	switch value {
	case SourceTeacherUpload, SourceStudentUpload, SourceSystemImport:
		return true
	default:
		return false
	}
}

func validAnalysisIntent(value AnalysisIntent) bool {
	switch value {
	case AnalysisIntentTutoring, AnalysisIntentAIGrading, AnalysisIntentArchiveOnly:
		return true
	default:
		return false
	}
}

func validationError(message string) error {
	return fmt.Errorf("%w: %s", ErrValidation, message)
}
