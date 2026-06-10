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
	TutoringAnalysisStatusQueued     TutoringAnalysisStatus = "QUEUED"
	TutoringAnalysisStatusInProgress TutoringAnalysisStatus = "IN_PROGRESS"
	TutoringAnalysisStatusSucceeded  TutoringAnalysisStatus = "SUCCEEDED"
	TutoringAnalysisStatusFailed     TutoringAnalysisStatus = "FAILED"
)

type TutoringAnalysisRequest struct {
	ID                     string
	ArchiveItemID          string
	RequestedByPrincipalID string
	AnalysisGoal           string
	QuestionBankIntent     QuestionBankIntent
	Status                 TutoringAnalysisStatus
	LearningActionSource   StudentAppAITutorLearningActionSourceType
	FollowUpDepth          int
	SourceArchiveOwnerType OwnerType
	SourceArchiveStudentID string
	SourceArchiveMaterial  MaterialType
	ResultSummary          string
	ResultRef              string
	QuestionBankDraftRef   string
	ErrorCode              string
	ErrorMessage           string
	ClaimedByWorkerID      string
	ClaimExpiresAt         time.Time
	CreatedAt              time.Time
	CompletedAt            time.Time
	UpdatedAt              time.Time
}

type StudentAppAITutorResultArchiveFollowUpPendingRequestQuery struct {
	ArchiveItemID          string
	RequestedByPrincipalID string
	QuestionBankIntent     QuestionBankIntent
	FollowUpDepth          int
	StudentID              string
}

type CreateTutoringAnalysisRequestInput struct {
	Principal              PrincipalContext
	ArchiveItemID          string
	AnalysisGoal           string
	QuestionBankIntent     QuestionBankIntent
	LearningActionSource   StudentAppAITutorLearningActionSourceType
	FollowUpDepth          int
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
		LearningActionSource:   normalized.LearningActionSource,
		FollowUpDepth:          normalized.FollowUpDepth,
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
	learningActionSource := input.LearningActionSource
	if learningActionSource == "" {
		learningActionSource = StudentAppAITutorLearningActionSourcePublishedStudyPacket
	}
	if !validStudentAppAITutorLearningActionSourceType(learningActionSource) {
		return CreateTutoringAnalysisRequestInput{}, validationError("learningActionSource is unsupported")
	}
	followUpDepth, err := normalizeTutoringAnalysisFollowUpDepth(learningActionSource, input.FollowUpDepth)
	if err != nil {
		return CreateTutoringAnalysisRequestInput{}, err
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
		LearningActionSource:   learningActionSource,
		FollowUpDepth:          followUpDepth,
		SourceArchiveOwnerType: input.SourceArchiveOwnerType,
		SourceArchiveStudentID: strings.TrimSpace(input.SourceArchiveStudentID),
		SourceArchiveMaterial:  input.SourceArchiveMaterial,
	}, nil
}

func normalizeTutoringAnalysisFollowUpDepth(
	source StudentAppAITutorLearningActionSourceType,
	depth int,
) (int, error) {
	if source == StudentAppAITutorLearningActionSourceResultArchive {
		return normalizeAITutorResultArchiveNextFollowUpDepth(depth)
	}
	if depth != 0 {
		return 0, validationError("followUpDepth is unsupported for published study packet")
	}
	return 0, nil
}

func NormalizeArchiveItemID(value string) (string, error) {
	return normalizeRequiredText(value, maxArchiveContentRefLength, "archiveItemId")
}

func validQuestionBankIntent(value QuestionBankIntent) bool {
	return value == QuestionBankIntentNone || value == QuestionBankIntentGeneratePersonalizedCheck
}

func BuildStudentAppAITutorResultArchiveFollowUpPendingRequestQuery(
	request TutoringAnalysisRequest,
) (StudentAppAITutorResultArchiveFollowUpPendingRequestQuery, error) {
	if TutoringAnalysisRequestLearningActionSource(request) != StudentAppAITutorLearningActionSourceResultArchive {
		return StudentAppAITutorResultArchiveFollowUpPendingRequestQuery{}, validationError("learningActionSource must be AI_TUTOR_RESULT_ARCHIVE")
	}
	archiveItemID, err := NormalizeArchiveItemID(request.ArchiveItemID)
	if err != nil {
		return StudentAppAITutorResultArchiveFollowUpPendingRequestQuery{}, err
	}
	principalID, err := normalizeRequiredText(request.RequestedByPrincipalID, maxArchiveContentRefLength, "requestedByPrincipalId")
	if err != nil {
		return StudentAppAITutorResultArchiveFollowUpPendingRequestQuery{}, err
	}
	if !validQuestionBankIntent(request.QuestionBankIntent) || request.QuestionBankIntent == QuestionBankIntentNone {
		return StudentAppAITutorResultArchiveFollowUpPendingRequestQuery{}, validationError("questionBankIntent is unsupported")
	}
	followUpDepth, err := normalizeAITutorResultArchiveNextFollowUpDepth(request.FollowUpDepth)
	if err != nil {
		return StudentAppAITutorResultArchiveFollowUpPendingRequestQuery{}, err
	}
	studentID, err := normalizeRequiredText(request.SourceArchiveStudentID, maxArchiveStudentIDLength, "sourceArchiveStudentId")
	if err != nil {
		return StudentAppAITutorResultArchiveFollowUpPendingRequestQuery{}, err
	}
	return StudentAppAITutorResultArchiveFollowUpPendingRequestQuery{
		ArchiveItemID:          archiveItemID,
		RequestedByPrincipalID: principalID,
		QuestionBankIntent:     request.QuestionBankIntent,
		FollowUpDepth:          followUpDepth,
		StudentID:              studentID,
	}, nil
}

func IsPendingTutoringAnalysisStatus(status TutoringAnalysisStatus) bool {
	return status == TutoringAnalysisStatusQueued || status == TutoringAnalysisStatusInProgress
}

func TutoringAnalysisRequestLearningActionSource(
	request TutoringAnalysisRequest,
) StudentAppAITutorLearningActionSourceType {
	if request.LearningActionSource == "" {
		return StudentAppAITutorLearningActionSourcePublishedStudyPacket
	}
	return request.LearningActionSource
}
