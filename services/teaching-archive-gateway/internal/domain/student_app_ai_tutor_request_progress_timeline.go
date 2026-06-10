package domain

import (
	"net/url"
	"time"
)

type StudentAppAITutorProgressStage string

const (
	StudentAppAITutorProgressStageQueued             StudentAppAITutorProgressStage = "QUEUED"
	StudentAppAITutorProgressStageInProgress         StudentAppAITutorProgressStage = "IN_PROGRESS"
	StudentAppAITutorProgressStageResultReady        StudentAppAITutorProgressStage = "RESULT_READY"
	StudentAppAITutorProgressStageQuestionBankReady  StudentAppAITutorProgressStage = "QUESTION_BANK_READY"
	StudentAppAITutorProgressStageNeedsTeacherReview StudentAppAITutorProgressStage = "NEEDS_TEACHER_REVIEW"
)

type StudentAppAITutorNextAction string

const (
	StudentAppAITutorNextActionWaitForAITutor        StudentAppAITutorNextAction = "WAIT_FOR_AI_TUTOR"
	StudentAppAITutorNextActionWaitForReviewedResult StudentAppAITutorNextAction = "WAIT_FOR_REVIEWED_RESULT"
	StudentAppAITutorNextActionViewResultArchive     StudentAppAITutorNextAction = "VIEW_AI_TUTOR_RESULT_ARCHIVE"
	StudentAppAITutorNextActionOpenQuestionBankDraft StudentAppAITutorNextAction = "OPEN_QUESTION_BANK_DRAFT"
	StudentAppAITutorNextActionAskTeacher            StudentAppAITutorNextAction = "ASK_TEACHER"
)

type StudentAppAITutorProgressStepStatus string

const (
	StudentAppAITutorProgressStepCompleted StudentAppAITutorProgressStepStatus = "COMPLETED"
	StudentAppAITutorProgressStepActive    StudentAppAITutorProgressStepStatus = "ACTIVE"
	StudentAppAITutorProgressStepPending   StudentAppAITutorProgressStepStatus = "PENDING"
	StudentAppAITutorProgressStepBlocked   StudentAppAITutorProgressStepStatus = "BLOCKED"
)

type StudentAppAITutorProgressActionState string

const (
	StudentAppAITutorProgressActionAvailable          StudentAppAITutorProgressActionState = "AVAILABLE"
	StudentAppAITutorProgressActionWaiting            StudentAppAITutorProgressActionState = "WAITING"
	StudentAppAITutorProgressActionNeedsTeacherReview StudentAppAITutorProgressActionState = "NEEDS_TEACHER_REVIEW"
)

type StudentAppAITutorRequestProgressCard struct {
	ID                    string
	ArchiveItemID         string
	AnalysisGoal          string
	QuestionBankIntent    QuestionBankIntent
	Status                TutoringAnalysisStatus
	LearningActionSource  StudentAppAITutorLearningActionSourceType
	FollowUpDepth         int
	SourceArchiveMaterial MaterialType
	ProgressStage         StudentAppAITutorProgressStage
	NextStudentAction     StudentAppAITutorNextAction
	PrimaryAction         StudentAppAITutorRequestProgressAction
	SafeStatusMessage     string
	Timeline              []StudentAppAITutorRequestProgressTimelineStep
	CreatedAt             time.Time
	CompletedAt           time.Time
	UpdatedAt             time.Time
}

type StudentAppAITutorRequestProgressTimelineStep struct {
	StepID      string
	Title       string
	Status      StudentAppAITutorProgressStepStatus
	CompletedAt time.Time
}

type StudentAppAITutorRequestProgressAction struct {
	ActionType           StudentAppAITutorNextAction
	State                StudentAppAITutorProgressActionState
	TargetEndpoint       string
	TargetURL            string
	Method               string
	ArchiveItemID        string
	QuestionBankDraftRef string
}

func BuildStudentAppAITutorRequestProgressCard(
	request TutoringAnalysisRequest,
) (StudentAppAITutorRequestProgressCard, error) {
	id, err := normalizeRequiredText(request.ID, maxArchiveContentRefLength, "id")
	if err != nil {
		return StudentAppAITutorRequestProgressCard{}, err
	}
	archiveItemID, err := NormalizeArchiveItemID(request.ArchiveItemID)
	if err != nil {
		return StudentAppAITutorRequestProgressCard{}, err
	}
	analysisGoal, err := normalizeRequiredText(request.AnalysisGoal, maxTutoringAnalysisGoalLength, "analysisGoal")
	if err != nil {
		return StudentAppAITutorRequestProgressCard{}, err
	}
	if !validQuestionBankIntent(request.QuestionBankIntent) {
		return StudentAppAITutorRequestProgressCard{}, validationError("questionBankIntent is unsupported")
	}
	if !validTutoringAnalysisStatus(request.Status) {
		return StudentAppAITutorRequestProgressCard{}, validationError("status is unsupported")
	}
	learningActionSource := TutoringAnalysisRequestLearningActionSource(request)
	if !validStudentAppAITutorLearningActionSourceType(learningActionSource) {
		return StudentAppAITutorRequestProgressCard{}, validationError("learningActionSource is unsupported")
	}
	followUpDepth, err := normalizeTutoringAnalysisFollowUpDepth(learningActionSource, request.FollowUpDepth)
	if err != nil {
		return StudentAppAITutorRequestProgressCard{}, err
	}
	if request.SourceArchiveOwnerType != OwnerTypeStudent {
		return StudentAppAITutorRequestProgressCard{}, validationError("sourceArchiveOwnerType must be STUDENT")
	}
	if _, err := normalizeRequiredText(
		request.SourceArchiveStudentID,
		maxArchiveStudentIDLength,
		"sourceArchiveStudentId",
	); err != nil {
		return StudentAppAITutorRequestProgressCard{}, err
	}
	if !validMaterialType(request.SourceArchiveMaterial) {
		return StudentAppAITutorRequestProgressCard{}, validationError("sourceArchiveMaterial is unsupported")
	}

	stage, nextAction, message := resolveStudentAppAITutorProgressState(request)
	primaryAction, err := buildStudentAppAITutorRequestProgressPrimaryAction(request, archiveItemID, nextAction)
	if err != nil {
		return StudentAppAITutorRequestProgressCard{}, err
	}
	return StudentAppAITutorRequestProgressCard{
		ID:                    id,
		ArchiveItemID:         archiveItemID,
		AnalysisGoal:          analysisGoal,
		QuestionBankIntent:    request.QuestionBankIntent,
		Status:                request.Status,
		LearningActionSource:  learningActionSource,
		FollowUpDepth:         followUpDepth,
		SourceArchiveMaterial: request.SourceArchiveMaterial,
		ProgressStage:         stage,
		NextStudentAction:     nextAction,
		PrimaryAction:         primaryAction,
		SafeStatusMessage:     message,
		Timeline:              buildStudentAppAITutorProgressTimeline(request),
		CreatedAt:             request.CreatedAt.UTC(),
		CompletedAt:           request.CompletedAt.UTC(),
		UpdatedAt:             request.UpdatedAt.UTC(),
	}, nil
}

func buildStudentAppAITutorRequestProgressPrimaryAction(
	request TutoringAnalysisRequest,
	archiveItemID string,
	nextAction StudentAppAITutorNextAction,
) (StudentAppAITutorRequestProgressAction, error) {
	switch nextAction {
	case StudentAppAITutorNextActionViewResultArchive:
		return StudentAppAITutorRequestProgressAction{
			ActionType:     nextAction,
			State:          StudentAppAITutorProgressActionAvailable,
			TargetEndpoint: "/v1/student-app/archive-items/" + archiveItemID + "/ai-tutor-result/rendered",
			TargetURL:      "/v1/student-app/archive-items/" + archiveItemID + "/ai-tutor-result/rendered",
			Method:         "GET",
			ArchiveItemID:  archiveItemID,
		}, nil
	case StudentAppAITutorNextActionOpenQuestionBankDraft:
		draftRef, err := NormalizeQuestionBankDraftRef(request.QuestionBankDraftRef)
		if err != nil {
			return StudentAppAITutorRequestProgressAction{}, err
		}
		return StudentAppAITutorRequestProgressAction{
			ActionType:           nextAction,
			State:                StudentAppAITutorProgressActionAvailable,
			TargetEndpoint:       "/v1/student-app/question-bank-draft-content",
			TargetURL:            "/v1/student-app/question-bank-draft-content?questionBankDraftRef=" + url.QueryEscape(draftRef),
			Method:               "GET",
			QuestionBankDraftRef: draftRef,
		}, nil
	case StudentAppAITutorNextActionAskTeacher:
		return StudentAppAITutorRequestProgressAction{
			ActionType: nextAction,
			State:      StudentAppAITutorProgressActionNeedsTeacherReview,
		}, nil
	default:
		return StudentAppAITutorRequestProgressAction{
			ActionType: nextAction,
			State:      StudentAppAITutorProgressActionWaiting,
		}, nil
	}
}

func resolveStudentAppAITutorProgressState(
	request TutoringAnalysisRequest,
) (StudentAppAITutorProgressStage, StudentAppAITutorNextAction, string) {
	switch request.Status {
	case TutoringAnalysisStatusQueued:
		return StudentAppAITutorProgressStageQueued,
			StudentAppAITutorNextActionWaitForAITutor,
			"AI tutor request is waiting to start."
	case TutoringAnalysisStatusInProgress:
		return StudentAppAITutorProgressStageInProgress,
			StudentAppAITutorNextActionWaitForReviewedResult,
			"AI tutor is preparing a reviewed result."
	case TutoringAnalysisStatusSucceeded:
		if request.QuestionBankDraftRef != "" {
			return StudentAppAITutorProgressStageQuestionBankReady,
				StudentAppAITutorNextActionOpenQuestionBankDraft,
				"Personalized practice is ready."
		}
		return StudentAppAITutorProgressStageResultReady,
			StudentAppAITutorNextActionViewResultArchive,
			"Reviewed AI tutor result is ready."
	case TutoringAnalysisStatusFailed:
		return StudentAppAITutorProgressStageNeedsTeacherReview,
			StudentAppAITutorNextActionAskTeacher,
			"This request needs teacher review before the student continues."
	default:
		return StudentAppAITutorProgressStageNeedsTeacherReview,
			StudentAppAITutorNextActionAskTeacher,
			"This request needs teacher review before the student continues."
	}
}

func buildStudentAppAITutorProgressTimeline(
	request TutoringAnalysisRequest,
) []StudentAppAITutorRequestProgressTimelineStep {
	return []StudentAppAITutorRequestProgressTimelineStep{
		{
			StepID:      "REQUEST_QUEUED",
			Title:       "Request received",
			Status:      studentAppAITutorProgressStepStatus(request.Status, 0),
			CompletedAt: request.CreatedAt.UTC(),
		},
		{
			StepID:      "AI_TUTOR_WORKING",
			Title:       "AI tutor working",
			Status:      studentAppAITutorProgressStepStatus(request.Status, 1),
			CompletedAt: request.CompletedAt.UTC(),
		},
		{
			StepID:      "REVIEWED_RESULT",
			Title:       "Reviewed result",
			Status:      studentAppAITutorProgressStepStatus(request.Status, 2),
			CompletedAt: request.CompletedAt.UTC(),
		},
		{
			StepID:      "STUDENT_DELIVERY",
			Title:       "Ready for student",
			Status:      studentAppAITutorProgressStepStatus(request.Status, 3),
			CompletedAt: request.CompletedAt.UTC(),
		},
	}
}

func studentAppAITutorProgressStepStatus(
	status TutoringAnalysisStatus,
	step int,
) StudentAppAITutorProgressStepStatus {
	switch status {
	case TutoringAnalysisStatusQueued:
		if step == 0 {
			return StudentAppAITutorProgressStepActive
		}
		return StudentAppAITutorProgressStepPending
	case TutoringAnalysisStatusInProgress:
		if step == 0 {
			return StudentAppAITutorProgressStepCompleted
		}
		if step == 1 {
			return StudentAppAITutorProgressStepActive
		}
		return StudentAppAITutorProgressStepPending
	case TutoringAnalysisStatusSucceeded:
		return StudentAppAITutorProgressStepCompleted
	case TutoringAnalysisStatusFailed:
		if step <= 1 {
			return StudentAppAITutorProgressStepCompleted
		}
		return StudentAppAITutorProgressStepBlocked
	default:
		return StudentAppAITutorProgressStepBlocked
	}
}
