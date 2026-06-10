package domain_test

import (
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestBuildStudentAppAITutorRequestProgressCardPreservesSafeFollowUpProgress(t *testing.T) {
	request := studentAppAITutorProgressRequest(domain.TutoringAnalysisStatusSucceeded)
	request.LearningActionSource = domain.StudentAppAITutorLearningActionSourceResultArchive
	request.FollowUpDepth = 2
	request.ResultSummary = "Reviewed guidance is ready"
	request.ResultRef = "local://internal/tutor-result.json"
	request.ErrorMessage = "internal worker trace should never reach student UI"
	request.ClaimedByWorkerID = "worker_internal_001"
	request.CompletedAt = time.Date(2026, 6, 10, 10, 4, 0, 0, time.UTC)
	request.UpdatedAt = request.CompletedAt

	card, err := domain.BuildStudentAppAITutorRequestProgressCard(request)
	if err != nil {
		t.Fatalf("BuildStudentAppAITutorRequestProgressCard returned error: %v", err)
	}

	if card.ProgressStage != domain.StudentAppAITutorProgressStageResultReady {
		t.Fatalf("ProgressStage = %q", card.ProgressStage)
	}
	if card.NextStudentAction != domain.StudentAppAITutorNextActionViewResultArchive {
		t.Fatalf("NextStudentAction = %q", card.NextStudentAction)
	}
	if card.LearningActionSource != domain.StudentAppAITutorLearningActionSourceResultArchive {
		t.Fatalf("LearningActionSource = %q", card.LearningActionSource)
	}
	if card.FollowUpDepth != 2 {
		t.Fatalf("FollowUpDepth = %d", card.FollowUpDepth)
	}
	if len(card.Timeline) != 4 {
		t.Fatalf("timeline length = %d", len(card.Timeline))
	}
	if card.Timeline[0].Status != domain.StudentAppAITutorProgressStepCompleted ||
		card.Timeline[3].Status != domain.StudentAppAITutorProgressStepCompleted {
		t.Fatalf("timeline statuses = %#v", card.Timeline)
	}
	for _, leaked := range []string{request.ResultRef, request.ErrorMessage, request.ClaimedByWorkerID} {
		if leaked != "" && strings.Contains(card.SafeStatusMessage, leaked) {
			t.Fatalf("SafeStatusMessage leaked %q: %q", leaked, card.SafeStatusMessage)
		}
	}
}

func TestBuildStudentAppAITutorRequestProgressCardUsesSafeFailureMessage(t *testing.T) {
	request := studentAppAITutorProgressRequest(domain.TutoringAnalysisStatusFailed)
	request.ErrorCode = "MODEL_TIMEOUT"
	request.ErrorMessage = "provider stack trace with secret path"
	request.UpdatedAt = time.Date(2026, 6, 10, 10, 5, 0, 0, time.UTC)
	request.CompletedAt = request.UpdatedAt

	card, err := domain.BuildStudentAppAITutorRequestProgressCard(request)
	if err != nil {
		t.Fatalf("BuildStudentAppAITutorRequestProgressCard returned error: %v", err)
	}

	if card.ProgressStage != domain.StudentAppAITutorProgressStageNeedsTeacherReview {
		t.Fatalf("ProgressStage = %q", card.ProgressStage)
	}
	if card.NextStudentAction != domain.StudentAppAITutorNextActionAskTeacher {
		t.Fatalf("NextStudentAction = %q", card.NextStudentAction)
	}
	if strings.Contains(card.SafeStatusMessage, request.ErrorCode) ||
		strings.Contains(card.SafeStatusMessage, request.ErrorMessage) {
		t.Fatalf("failure message leaked internal error: %q", card.SafeStatusMessage)
	}
}

func TestBuildStudentAppAITutorRequestProgressCardRejectsTeachingOwnedRequest(t *testing.T) {
	request := studentAppAITutorProgressRequest(domain.TutoringAnalysisStatusQueued)
	request.SourceArchiveOwnerType = domain.OwnerTypeTeaching
	request.SourceArchiveStudentID = ""

	if _, err := domain.BuildStudentAppAITutorRequestProgressCard(request); err == nil {
		t.Fatal("expected teaching-owned request to be rejected")
	}
}

func studentAppAITutorProgressRequest(status domain.TutoringAnalysisStatus) domain.TutoringAnalysisRequest {
	createdAt := time.Date(2026, 6, 10, 10, 0, 0, 0, time.UTC)
	return domain.TutoringAnalysisRequest{
		ID:                     "tutor_req_progress_001",
		ArchiveItemID:          "tarch_student_ai_tutor_result_001",
		RequestedByPrincipalID: "student_001",
		AnalysisGoal:           "continue guided practice",
		QuestionBankIntent:     domain.QuestionBankIntentGeneratePersonalizedCheck,
		Status:                 status,
		LearningActionSource:   domain.StudentAppAITutorLearningActionSourcePublishedStudyPacket,
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		SourceArchiveStudentID: "student_001",
		SourceArchiveMaterial:  domain.MaterialTypeHomework,
		CreatedAt:              createdAt,
		UpdatedAt:              createdAt,
	}
}
