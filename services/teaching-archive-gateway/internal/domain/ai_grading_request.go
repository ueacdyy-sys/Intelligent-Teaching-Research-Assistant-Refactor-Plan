package domain

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	maxAIGradingInstructionsLength = 1000
	maxAIGradingRubricRefLength    = 1000
)

type AIGradingStatus string

const (
	AIGradingStatusQueued AIGradingStatus = "QUEUED"
)

type AIGradingRequest struct {
	ID                     string
	ArchiveItemID          string
	RequestedByPrincipalID string
	GradingInstructions    string
	RubricRef              string
	Status                 AIGradingStatus
	SourceArchiveOwnerType OwnerType
	SourceArchiveStudentID string
	SourceArchiveMaterial  MaterialType
	SourceArchiveOCRStatus OCRStatus
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

type CreateAIGradingRequestInput struct {
	Principal              PrincipalContext
	ArchiveItemID          string
	GradingInstructions    string
	RubricRef              string
	SourceArchiveOwnerType OwnerType
	SourceArchiveStudentID string
	SourceArchiveMaterial  MaterialType
	SourceArchiveOCRStatus OCRStatus
	SourceAnalysisIntents  []AnalysisIntent
}

func NewAIGradingRequest(
	id string,
	input CreateAIGradingRequestInput,
	createdAt time.Time,
) (AIGradingRequest, error) {
	normalized, err := NormalizeCreateAIGradingRequestInput(input)
	if err != nil {
		return AIGradingRequest{}, err
	}
	if !strings.HasPrefix(id, "grading_req_") {
		return AIGradingRequest{}, fmt.Errorf("generated ai grading request id must use grading_req_ prefix")
	}
	createdAt = createdAt.UTC()

	return AIGradingRequest{
		ID:                     id,
		ArchiveItemID:          normalized.ArchiveItemID,
		RequestedByPrincipalID: strings.TrimSpace(normalized.Principal.PrincipalID),
		GradingInstructions:    normalized.GradingInstructions,
		RubricRef:              normalized.RubricRef,
		Status:                 AIGradingStatusQueued,
		SourceArchiveOwnerType: normalized.SourceArchiveOwnerType,
		SourceArchiveStudentID: normalized.SourceArchiveStudentID,
		SourceArchiveMaterial:  normalized.SourceArchiveMaterial,
		SourceArchiveOCRStatus: normalized.SourceArchiveOCRStatus,
		CreatedAt:              createdAt,
		UpdatedAt:              createdAt,
	}, nil
}

func NormalizeCreateAIGradingRequestInput(input CreateAIGradingRequestInput) (CreateAIGradingRequestInput, error) {
	archiveItemID, err := NormalizeArchiveItemID(input.ArchiveItemID)
	if err != nil {
		return CreateAIGradingRequestInput{}, err
	}
	instructions, err := normalizeRequiredText(input.GradingInstructions, maxAIGradingInstructionsLength, "gradingInstructions")
	if err != nil {
		return CreateAIGradingRequestInput{}, err
	}
	rubricRef := strings.TrimSpace(input.RubricRef)
	if utf8.RuneCountInString(rubricRef) > maxAIGradingRubricRefLength {
		return CreateAIGradingRequestInput{}, validationError("rubricRef is too long")
	}
	if !eligibleAIGradingArchive(input) {
		return CreateAIGradingRequestInput{}, validationError("archive item is not eligible for AI grading")
	}

	return CreateAIGradingRequestInput{
		Principal:              input.Principal,
		ArchiveItemID:          archiveItemID,
		GradingInstructions:    instructions,
		RubricRef:              rubricRef,
		SourceArchiveOwnerType: input.SourceArchiveOwnerType,
		SourceArchiveStudentID: strings.TrimSpace(input.SourceArchiveStudentID),
		SourceArchiveMaterial:  input.SourceArchiveMaterial,
		SourceArchiveOCRStatus: input.SourceArchiveOCRStatus,
		SourceAnalysisIntents:  append([]AnalysisIntent(nil), input.SourceAnalysisIntents...),
	}, nil
}

func AuthorizeCreateAIGradingRequest(principal PrincipalContext, item ArchiveItem) error {
	if err := ValidatePrincipalContext(principal); err != nil {
		return err
	}
	switch item.OwnerType {
	case OwnerTypeStudent:
		if canWriteAssignedStudentArchive(principal, item.StudentID) || canWriteOwnStudentArchive(principal, item.StudentID) {
			return nil
		}
	case OwnerTypeTeaching:
		return requireScope(principal, ScopeTeachingWrite)
	}
	return ErrForbidden
}

func eligibleAIGradingArchive(input CreateAIGradingRequestInput) bool {
	return input.SourceArchiveOwnerType == OwnerTypeStudent &&
		strings.TrimSpace(input.SourceArchiveStudentID) != "" &&
		validAIGradingMaterial(input.SourceArchiveMaterial) &&
		hasAIGradingIntent(input.SourceAnalysisIntents)
}

func validAIGradingMaterial(value MaterialType) bool {
	return value == MaterialTypeQuiz || value == MaterialTypePaper || value == MaterialTypeHomework
}

func hasAIGradingIntent(intents []AnalysisIntent) bool {
	for _, intent := range intents {
		if intent == AnalysisIntentAIGrading {
			return true
		}
	}
	return false
}
