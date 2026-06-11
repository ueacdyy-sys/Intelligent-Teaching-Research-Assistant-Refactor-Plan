package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestBuildAITutorWorkerStudyPacketInputRequiresClaimedReadyStudyPacket(t *testing.T) {
	now := time.Date(2026, 6, 8, 10, 0, 0, 0, time.UTC)
	request := aiTutorWorkerStudyPacketRequest(now)
	packet := aiTutorWorkerStudyPacketFixture(t)

	input, err := domain.BuildAITutorWorkerStudyPacketInput(
		domain.NormalizedReadAITutorWorkerStudyPacketInputInput{
			Principal: servicePrincipal(),
			RequestID: "tutor_req_worker_input",
			WorkerID:  "worker_student_tutor_01",
		},
		request,
		packet,
		now,
	)
	if err != nil {
		t.Fatalf("BuildAITutorWorkerStudyPacketInput returned error: %v", err)
	}
	if input.RequestID != "tutor_req_worker_input" ||
		input.PacketStatus != domain.StudentAppArchiveItemStudyPacketStatusReady ||
		input.RenderFormat != domain.AITutorWorkerStudyPacketInputRenderFormatSafeTextBlocks ||
		len(input.Blocks) != 1 {
		t.Fatalf("input = %#v", input)
	}
}

func TestBuildAITutorWorkerResultArchiveInputUsesSafeRenderEnvelope(t *testing.T) {
	now := time.Date(2026, 6, 8, 14, 0, 0, 0, time.UTC)
	request := aiTutorWorkerStudyPacketRequest(now)
	request.ArchiveItemID = "tarch_student_ai_tutor_result_001"
	request.SourceArchiveMaterial = domain.MaterialTypeHomework
	request.LearningActionSource = domain.StudentAppAITutorLearningActionSourceResultArchive
	request.FollowUpDepth = 1
	rendered, err := domain.BuildStudentAppAITutorResultArchiveRenderEnvelope(aiTutorResultArchiveCardFixture())
	if err != nil {
		t.Fatalf("BuildStudentAppAITutorResultArchiveRenderEnvelope returned error: %v", err)
	}

	input, err := domain.BuildAITutorWorkerResultArchiveInput(
		domain.NormalizedReadAITutorWorkerStudyPacketInputInput{
			Principal: servicePrincipal(),
			RequestID: "tutor_req_worker_input",
			WorkerID:  "worker_student_tutor_01",
		},
		request,
		rendered,
		now,
	)
	if err != nil {
		t.Fatalf("BuildAITutorWorkerResultArchiveInput returned error: %v", err)
	}
	if input.LearningActionSource != domain.StudentAppAITutorLearningActionSourceResultArchive ||
		input.FollowUpDepth != 1 ||
		input.ResultArchiveStatus != domain.StudentAppAITutorResultArchiveStatusReady ||
		input.PacketStatus != "" ||
		input.RenderFormat != domain.AITutorWorkerStudyPacketInputRenderFormatSafeTextBlocks ||
		len(input.Blocks) != 3 {
		t.Fatalf("input = %#v", input)
	}
	if input.Blocks[0].BlockType != domain.AITutorWorkerStudyPacketInputBlockTypeSummary ||
		input.Blocks[1].BlockType != domain.AITutorWorkerStudyPacketInputBlockTypeGuidanceSection ||
		len(input.Blocks[1].SourceBlockRefs) == 0 {
		t.Fatalf("blocks = %#v", input.Blocks)
	}
}

func TestBuildAITutorWorkerQuestionBankFeedbackInputUsesSafeRenderEnvelope(t *testing.T) {
	now := time.Date(2026, 6, 8, 15, 0, 0, 0, time.UTC)
	request := aiTutorWorkerStudyPacketRequest(now)
	request.ArchiveItemID = "tarch_student_feedback_001"
	request.SourceArchiveMaterial = domain.MaterialTypeHomework
	request.LearningActionSource = domain.StudentAppAITutorLearningActionSourceQuestionBankFeedback
	rendered, err := domain.BuildQuestionBankDraftAnswerFeedbackRenderEnvelope(questionBankDraftAnswerFeedbackCardFixture())
	if err != nil {
		t.Fatalf("BuildQuestionBankDraftAnswerFeedbackRenderEnvelope returned error: %v", err)
	}

	input, err := domain.BuildAITutorWorkerQuestionBankFeedbackInput(
		domain.NormalizedReadAITutorWorkerStudyPacketInputInput{
			Principal: servicePrincipal(),
			RequestID: "tutor_req_worker_input",
			WorkerID:  "worker_student_tutor_01",
		},
		request,
		rendered,
		now,
	)
	if err != nil {
		t.Fatalf("BuildAITutorWorkerQuestionBankFeedbackInput returned error: %v", err)
	}
	if input.LearningActionSource != domain.StudentAppAITutorLearningActionSourceQuestionBankFeedback ||
		input.FeedbackStatus != domain.StudentAppQuestionBankDraftAnswerFeedbackStatusReady ||
		input.FeedbackSubmissionID != "qbank_ans_sub_001" ||
		input.FeedbackSourceArchiveItemID != "tarch_source_homework_001" ||
		input.RenderFormat != domain.AITutorWorkerStudyPacketInputRenderFormatSafeTextBlocks ||
		len(input.Blocks) < 4 {
		t.Fatalf("input = %#v", input)
	}
	if input.Blocks[0].BlockType != domain.AITutorWorkerStudyPacketInputBlockTypeSummary ||
		input.Blocks[1].BlockType != domain.AITutorWorkerStudyPacketInputBlockTypeGuidanceSection {
		t.Fatalf("blocks = %#v", input.Blocks)
	}
}

func TestBuildAITutorWorkerResultArchiveInputRejectsTamperedFollowUpDepth(t *testing.T) {
	now := time.Date(2026, 6, 8, 14, 0, 0, 0, time.UTC)
	request := aiTutorWorkerStudyPacketRequest(now)
	request.ArchiveItemID = "tarch_student_ai_tutor_result_001"
	request.SourceArchiveMaterial = domain.MaterialTypeHomework
	request.LearningActionSource = domain.StudentAppAITutorLearningActionSourceResultArchive
	request.FollowUpDepth = 2
	rendered, err := domain.BuildStudentAppAITutorResultArchiveRenderEnvelope(aiTutorResultArchiveCardFixture())
	if err != nil {
		t.Fatalf("BuildStudentAppAITutorResultArchiveRenderEnvelope returned error: %v", err)
	}

	_, err = domain.BuildAITutorWorkerResultArchiveInput(
		domain.NormalizedReadAITutorWorkerStudyPacketInputInput{
			Principal: servicePrincipal(),
			RequestID: "tutor_req_worker_input",
			WorkerID:  "worker_student_tutor_01",
		},
		request,
		rendered,
		now,
	)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestBuildAITutorWorkerStudyPacketInputRejectsWrongWorker(t *testing.T) {
	now := time.Date(2026, 6, 8, 10, 0, 0, 0, time.UTC)
	_, err := domain.BuildAITutorWorkerStudyPacketInput(
		domain.NormalizedReadAITutorWorkerStudyPacketInputInput{
			Principal: servicePrincipal(),
			RequestID: "tutor_req_worker_input",
			WorkerID:  "worker_other",
		},
		aiTutorWorkerStudyPacketRequest(now),
		aiTutorWorkerStudyPacketFixture(t),
		now,
	)
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
}

func TestBuildAITutorWorkerStudyPacketInputRejectsExpiredLease(t *testing.T) {
	now := time.Date(2026, 6, 8, 10, 0, 0, 0, time.UTC)
	request := aiTutorWorkerStudyPacketRequest(now)
	request.ClaimExpiresAt = now.Add(-time.Second)
	_, err := domain.BuildAITutorWorkerStudyPacketInput(
		domain.NormalizedReadAITutorWorkerStudyPacketInputInput{
			Principal: servicePrincipal(),
			RequestID: "tutor_req_worker_input",
			WorkerID:  "worker_student_tutor_01",
		},
		request,
		aiTutorWorkerStudyPacketFixture(t),
		now,
	)
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
}

func TestBuildAITutorWorkerStudyPacketInputRejectsNonStudentSource(t *testing.T) {
	now := time.Date(2026, 6, 8, 10, 0, 0, 0, time.UTC)
	request := aiTutorWorkerStudyPacketRequest(now)
	request.SourceArchiveOwnerType = domain.OwnerTypeTeaching
	request.SourceArchiveStudentID = ""
	_, err := domain.BuildAITutorWorkerStudyPacketInput(
		domain.NormalizedReadAITutorWorkerStudyPacketInputInput{
			Principal: servicePrincipal(),
			RequestID: "tutor_req_worker_input",
			WorkerID:  "worker_student_tutor_01",
		},
		request,
		aiTutorWorkerStudyPacketFixture(t),
		now,
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestBuildAITutorWorkerStudyPacketInputRejectsUnavailableLearningAction(t *testing.T) {
	now := time.Date(2026, 6, 8, 10, 0, 0, 0, time.UTC)
	request := aiTutorWorkerStudyPacketRequest(now)
	request.QuestionBankIntent = domain.QuestionBankIntentNone
	_, err := domain.BuildAITutorWorkerStudyPacketInput(
		domain.NormalizedReadAITutorWorkerStudyPacketInputInput{
			Principal: servicePrincipal(),
			RequestID: "tutor_req_worker_input",
			WorkerID:  "worker_student_tutor_01",
		},
		request,
		aiTutorWorkerStudyPacketFixture(t),
		now,
	)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func aiTutorWorkerStudyPacketRequest(now time.Time) domain.TutoringAnalysisRequest {
	return domain.TutoringAnalysisRequest{
		ID:                     "tutor_req_worker_input",
		ArchiveItemID:          "tarch_archive_material_001",
		RequestedByPrincipalID: "student_001",
		AnalysisGoal:           "generate personalized practice",
		QuestionBankIntent:     domain.QuestionBankIntentGeneratePersonalizedCheck,
		Status:                 domain.TutoringAnalysisStatusInProgress,
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		SourceArchiveStudentID: "student_001",
		SourceArchiveMaterial:  domain.MaterialTypeHandout,
		ClaimedByWorkerID:      "worker_student_tutor_01",
		ClaimExpiresAt:         now.Add(5 * time.Minute),
		CreatedAt:              now.Add(-10 * time.Minute),
		UpdatedAt:              now.Add(-5 * time.Minute),
	}
}

func aiTutorWorkerStudyPacketFixture(t *testing.T) domain.StudentAppArchiveItemStudyPacket {
	t.Helper()
	input, err := domain.NormalizeReadStudentAppArchiveItemInput(domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppArchiveItemInput returned error: %v", err)
	}
	packet, err := domain.BuildStudentAppArchiveItemStudyPacket(
		input,
		domain.ArchiveItem{
			ID:           "tarch_archive_material_001",
			OwnerType:    domain.OwnerTypeStudent,
			StudentID:    "student_001",
			MaterialType: domain.MaterialTypeHandout,
			Title:        "Fractions practice packet",
		},
		studentAppStudyPacketContentPreviewFixture("tarch_archive_material_001", "student_001"),
	)
	if err != nil {
		t.Fatalf("BuildStudentAppArchiveItemStudyPacket returned error: %v", err)
	}
	return packet
}
