package domain

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	maxTutoringAnalysisGoalLength = 500
)

var (
	ErrNotFound = errors.New("archive item not found")
	ErrConflict = errors.New("tutoring analysis request state conflict")
)

type QuestionBankIntent string

const (
	QuestionBankIntentNone                      QuestionBankIntent = "NONE"
	QuestionBankIntentGeneratePersonalizedCheck QuestionBankIntent = "GENERATE_PERSONALIZED_CHECK"
)

type TutoringAnalysisStatus string

const (
	TutoringAnalysisStatusQueued    TutoringAnalysisStatus = "QUEUED"
	TutoringAnalysisStatusSucceeded TutoringAnalysisStatus = "SUCCEEDED"
	TutoringAnalysisStatusFailed    TutoringAnalysisStatus = "FAILED"
)

type TutoringAnalysisRequest struct {
	ID                     string
	ArchiveItemID          string
	RequestedByPrincipalID string
	AnalysisGoal           string
	QuestionBankIntent     QuestionBankIntent
	Status                 TutoringAnalysisStatus
	SourceArchiveOwnerType OwnerType
	SourceArchiveStudentID string
	SourceArchiveMaterial  MaterialType
	ResultSummary          string
	ResultRef              string
	QuestionBankDraftRef   string
	ErrorCode              string
	ErrorMessage           string
	CreatedAt              time.Time
	CompletedAt            time.Time
	UpdatedAt              time.Time
}

type CreateTutoringAnalysisRequestInput struct {
	Principal              PrincipalContext
	ArchiveItemID          string
	AnalysisGoal           string
	QuestionBankIntent     QuestionBankIntent
	SourceArchiveOwnerType OwnerType
	SourceArchiveStudentID string
	SourceArchiveMaterial  MaterialType
}

func NewTutoringAnalysisRequest(
	id string,
	input CreateTutoringAnalysisRequestInput,
	createdAt time.Time,
) (TutoringAnalysisRequest, error) {
	normalized, err := NormalizeCreateTutoringAnalysisRequestInput(input)
	if err != nil {
		return TutoringAnalysisRequest{}, err
	}
	if !strings.HasPrefix(id, "tutor_req_") {
		return TutoringAnalysisRequest{}, fmt.Errorf("generated tutoring analysis request id must use tutor_req_ prefix")
	}

	return TutoringAnalysisRequest{
		ID:                     id,
		ArchiveItemID:          normalized.ArchiveItemID,
		RequestedByPrincipalID: strings.TrimSpace(normalized.Principal.PrincipalID),
		AnalysisGoal:           normalized.AnalysisGoal,
		QuestionBankIntent:     normalized.QuestionBankIntent,
		Status:                 TutoringAnalysisStatusQueued,
		SourceArchiveOwnerType: normalized.SourceArchiveOwnerType,
		SourceArchiveStudentID: normalized.SourceArchiveStudentID,
		SourceArchiveMaterial:  normalized.SourceArchiveMaterial,
		CreatedAt:              createdAt.UTC(),
		UpdatedAt:              createdAt.UTC(),
	}, nil
}

func NormalizeCreateTutoringAnalysisRequestInput(
	input CreateTutoringAnalysisRequestInput,
) (CreateTutoringAnalysisRequestInput, error) {
	archiveItemID, err := NormalizeArchiveItemID(input.ArchiveItemID)
	if err != nil {
		return CreateTutoringAnalysisRequestInput{}, err
	}
	analysisGoal, err := normalizeRequiredText(input.AnalysisGoal, maxTutoringAnalysisGoalLength, "analysisGoal")
	if err != nil {
		return CreateTutoringAnalysisRequestInput{}, err
	}
	questionBankIntent := input.QuestionBankIntent
	if questionBankIntent == "" {
		questionBankIntent = QuestionBankIntentNone
	}
	if !validQuestionBankIntent(questionBankIntent) {
		return CreateTutoringAnalysisRequestInput{}, validationError("questionBankIntent is unsupported")
	}
	if !validOwnerType(input.SourceArchiveOwnerType) {
		return CreateTutoringAnalysisRequestInput{}, validationError("sourceArchiveOwnerType is unsupported")
	}
	if input.SourceArchiveOwnerType == OwnerTypeStudent && strings.TrimSpace(input.SourceArchiveStudentID) == "" {
		return CreateTutoringAnalysisRequestInput{}, validationError("sourceArchiveStudentId is required")
	}
	if !validMaterialType(input.SourceArchiveMaterial) {
		return CreateTutoringAnalysisRequestInput{}, validationError("sourceArchiveMaterial is unsupported")
	}

	return CreateTutoringAnalysisRequestInput{
		Principal:              input.Principal,
		ArchiveItemID:          archiveItemID,
		AnalysisGoal:           analysisGoal,
		QuestionBankIntent:     questionBankIntent,
		SourceArchiveOwnerType: input.SourceArchiveOwnerType,
		SourceArchiveStudentID: strings.TrimSpace(input.SourceArchiveStudentID),
		SourceArchiveMaterial:  input.SourceArchiveMaterial,
	}, nil
}

func NormalizeArchiveItemID(value string) (string, error) {
	return normalizeRequiredText(value, maxArchiveContentRefLength, "archiveItemId")
}

func validQuestionBankIntent(value QuestionBankIntent) bool {
	return value == QuestionBankIntentNone || value == QuestionBankIntentGeneratePersonalizedCheck
}
