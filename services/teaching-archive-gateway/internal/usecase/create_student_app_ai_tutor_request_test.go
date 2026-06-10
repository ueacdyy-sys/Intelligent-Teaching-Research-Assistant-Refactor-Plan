package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestCreateStudentAppAITutorRequestQueuesOwnStudentArchiveAnalysis(t *testing.T) {
	repo := &fakeTutoringRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_student": archiveItem("tarch_student", "student_001", time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewCreateStudentAppAITutorRequest(
		repo,
		fixedIDs{id: "tutor_req_student_app"},
		fixedClock{now: time.Date(2026, 5, 30, 10, 30, 0, 0, time.UTC)},
	)

	got, err := uc.Execute(context.Background(), domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: " tarch_student ",
		AnalysisGoal:         " explain weak skills ",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if got.ID != "tutor_req_student_app" {
		t.Fatalf("ID = %q", got.ID)
	}
	if got.SourceArchiveOwnerType != domain.OwnerTypeStudent || got.SourceArchiveStudentID != "student_001" {
		t.Fatalf("source = %q %q", got.SourceArchiveOwnerType, got.SourceArchiveStudentID)
	}
	if got.QuestionBankIntent != domain.QuestionBankIntentGeneratePersonalizedCheck {
		t.Fatalf("QuestionBankIntent = %q", got.QuestionBankIntent)
	}
	if repo.creates != 1 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateStudentAppAITutorRequestUsesPublishedStudyPacketSource(t *testing.T) {
	repo := &fakeTutoringRepository{
		publishedItem: domain.ArchiveItem{
			ID:              "tarch_archive_material_001",
			OwnerType:       domain.OwnerTypeStudent,
			StudentID:       "student_001",
			MaterialType:    domain.MaterialTypeHandout,
			Title:           "Fractions practice packet",
			Source:          domain.SourceTeacherUpload,
			Tags:            []string{"fractions"},
			AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentTutoring},
			OCRStatus:       domain.OCRStatusNotRequired,
			CreatedAt:       time.Date(2026, 6, 7, 8, 0, 0, 0, time.UTC),
		},
		publishedOK:      true,
		contentPreview:   contentPreviewFixture("tarch_archive_material_001", "student_001"),
		contentPreviewOK: true,
	}
	uc := usecase.NewCreateStudentAppAITutorRequest(
		repo,
		fixedIDs{id: "tutor_req_student_app"},
		fixedClock{now: time.Date(2026, 6, 7, 10, 30, 0, 0, time.UTC)},
	)

	got, err := uc.Execute(context.Background(), domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: "tarch_archive_material_001",
		AnalysisGoal:         "generate practice from this published packet",
		QuestionBankIntent:   domain.QuestionBankIntentGeneratePersonalizedCheck,
		LearningActionSource: domain.StudentAppAITutorLearningActionSource{
			ActionType:   domain.StudentAppArchiveItemLearningActionPersonalizedQuestionBank,
			PacketStatus: domain.StudentAppArchiveItemStudyPacketStatusReady,
		},
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if got.ID != "tutor_req_student_app" ||
		got.ArchiveItemID != "tarch_archive_material_001" ||
		got.SourceArchiveMaterial != domain.MaterialTypeHandout ||
		got.QuestionBankIntent != domain.QuestionBankIntentGeneratePersonalizedCheck {
		t.Fatalf("request = %#v", got)
	}
	if repo.publishedGetReads != 1 || repo.contentPreviewReads != 1 {
		t.Fatalf("published reads detail:%d preview:%d", repo.publishedGetReads, repo.contentPreviewReads)
	}
	if repo.genericGetReads != 0 {
		t.Fatalf("generic GetByID reads = %d", repo.genericGetReads)
	}
	if repo.creates != 1 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateStudentAppAITutorRequestUsesResultArchiveActionSource(t *testing.T) {
	repo := &fakeTutoringRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_student_ai_tutor_result_001": aiTutorResultArchiveItem("tarch_student_ai_tutor_result_001", "student_001"),
		},
		resultArchiveSnapshot:   aiTutorResultArchiveSnapshot("tarch_student_ai_tutor_result_001", "student_001"),
		resultArchiveSnapshotOK: true,
	}
	uc := usecase.NewCreateStudentAppAITutorRequest(
		repo,
		fixedIDs{id: "tutor_req_student_app"},
		fixedClock{now: time.Date(2026, 6, 8, 13, 0, 0, 0, time.UTC)},
	)

	got, err := uc.Execute(context.Background(), domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: "tarch_student_ai_tutor_result_001",
		AnalysisGoal:         "continue guided practice from the archived result",
		QuestionBankIntent:   domain.QuestionBankIntentGeneratePersonalizedCheck,
		LearningActionSource: domain.StudentAppAITutorLearningActionSource{
			SourceType:          domain.StudentAppAITutorLearningActionSourceResultArchive,
			ActionType:          domain.StudentAppArchiveItemLearningActionAITutorRequest,
			ResultArchiveStatus: domain.StudentAppAITutorResultArchiveStatusReady,
			RenderFormat:        domain.StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks,
			FollowUpDepth:       1,
		},
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if got.ID != "tutor_req_student_app" ||
		got.ArchiveItemID != "tarch_student_ai_tutor_result_001" ||
		got.SourceArchiveMaterial != domain.MaterialTypeHomework ||
		got.FollowUpDepth != 1 {
		t.Fatalf("request = %#v", got)
	}
	if repo.createdRequest.FollowUpDepth != 1 ||
		repo.createdRequest.LearningActionSource != domain.StudentAppAITutorLearningActionSourceResultArchive {
		t.Fatalf("created request = %#v", repo.createdRequest)
	}
	if repo.genericGetReads != 1 || repo.resultArchiveSnapshotReads != 1 {
		t.Fatalf("result archive reads get:%d snapshot:%d", repo.genericGetReads, repo.resultArchiveSnapshotReads)
	}
	if repo.publishedGetReads != 0 || repo.contentPreviewReads != 0 {
		t.Fatalf("published reads detail:%d preview:%d", repo.publishedGetReads, repo.contentPreviewReads)
	}
	if repo.creates != 1 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateStudentAppAITutorRequestReusesPendingResultArchiveFollowUp(t *testing.T) {
	existing := domain.TutoringAnalysisRequest{
		ID:                     "tutor_req_existing_follow_up",
		ArchiveItemID:          "tarch_student_ai_tutor_result_001",
		RequestedByPrincipalID: "student_001",
		AnalysisGoal:           "continue guided practice from the archived result",
		QuestionBankIntent:     domain.QuestionBankIntentGeneratePersonalizedCheck,
		Status:                 domain.TutoringAnalysisStatusQueued,
		LearningActionSource:   domain.StudentAppAITutorLearningActionSourceResultArchive,
		FollowUpDepth:          1,
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		SourceArchiveStudentID: "student_001",
		SourceArchiveMaterial:  domain.MaterialTypeHomework,
		CreatedAt:              time.Date(2026, 6, 8, 12, 55, 0, 0, time.UTC),
		UpdatedAt:              time.Date(2026, 6, 8, 12, 55, 0, 0, time.UTC),
	}
	repo := &fakeTutoringRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_student_ai_tutor_result_001": aiTutorResultArchiveItem("tarch_student_ai_tutor_result_001", "student_001"),
		},
		resultArchiveSnapshot:          aiTutorResultArchiveSnapshot("tarch_student_ai_tutor_result_001", "student_001"),
		resultArchiveSnapshotOK:        true,
		pendingResultArchiveFollowUp:   existing,
		pendingResultArchiveFollowUpOK: true,
	}
	uc := usecase.NewCreateStudentAppAITutorRequest(
		repo,
		fixedIDs{id: "tutor_req_duplicate_follow_up"},
		fixedClock{now: time.Date(2026, 6, 8, 13, 0, 0, 0, time.UTC)},
	)

	got, err := uc.Execute(context.Background(), domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: "tarch_student_ai_tutor_result_001",
		AnalysisGoal:         "continue guided practice from the archived result",
		QuestionBankIntent:   domain.QuestionBankIntentGeneratePersonalizedCheck,
		LearningActionSource: domain.StudentAppAITutorLearningActionSource{
			SourceType:          domain.StudentAppAITutorLearningActionSourceResultArchive,
			ActionType:          domain.StudentAppArchiveItemLearningActionAITutorRequest,
			ResultArchiveStatus: domain.StudentAppAITutorResultArchiveStatusReady,
			RenderFormat:        domain.StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks,
			FollowUpDepth:       1,
		},
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if got.ID != "tutor_req_existing_follow_up" {
		t.Fatalf("ID = %q, want existing pending request", got.ID)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d, want 0", repo.creates)
	}
	if repo.pendingResultArchiveFollowUpReads != 1 {
		t.Fatalf("pending result archive follow-up reads = %d", repo.pendingResultArchiveFollowUpReads)
	}
}

func TestCreateStudentAppAITutorRequestCreatesAfterCompletedResultArchiveFollowUp(t *testing.T) {
	repo := &fakeTutoringRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_student_ai_tutor_result_001": aiTutorResultArchiveItem("tarch_student_ai_tutor_result_001", "student_001"),
		},
		resultArchiveSnapshot:   aiTutorResultArchiveSnapshot("tarch_student_ai_tutor_result_001", "student_001"),
		resultArchiveSnapshotOK: true,
		pendingResultArchiveFollowUp: domain.TutoringAnalysisRequest{
			ID:                     "tutor_req_completed_follow_up",
			ArchiveItemID:          "tarch_student_ai_tutor_result_001",
			RequestedByPrincipalID: "student_001",
			QuestionBankIntent:     domain.QuestionBankIntentGeneratePersonalizedCheck,
			Status:                 domain.TutoringAnalysisStatusSucceeded,
			LearningActionSource:   domain.StudentAppAITutorLearningActionSourceResultArchive,
			FollowUpDepth:          1,
			SourceArchiveStudentID: "student_001",
		},
		pendingResultArchiveFollowUpOK: true,
	}
	uc := usecase.NewCreateStudentAppAITutorRequest(
		repo,
		fixedIDs{id: "tutor_req_new_after_completed"},
		fixedClock{now: time.Date(2026, 6, 8, 13, 5, 0, 0, time.UTC)},
	)

	got, err := uc.Execute(context.Background(), domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: "tarch_student_ai_tutor_result_001",
		AnalysisGoal:         "continue guided practice again",
		QuestionBankIntent:   domain.QuestionBankIntentGeneratePersonalizedCheck,
		LearningActionSource: domain.StudentAppAITutorLearningActionSource{
			SourceType:          domain.StudentAppAITutorLearningActionSourceResultArchive,
			ActionType:          domain.StudentAppArchiveItemLearningActionAITutorRequest,
			ResultArchiveStatus: domain.StudentAppAITutorResultArchiveStatusReady,
			RenderFormat:        domain.StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks,
			FollowUpDepth:       1,
		},
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if got.ID != "tutor_req_new_after_completed" {
		t.Fatalf("ID = %q", got.ID)
	}
	if repo.creates != 1 {
		t.Fatalf("creates = %d, want 1", repo.creates)
	}
	if repo.pendingResultArchiveFollowUpReads != 1 {
		t.Fatalf("pending result archive follow-up reads = %d", repo.pendingResultArchiveFollowUpReads)
	}
}

func TestCreateStudentAppAITutorRequestRejectsUnsafeResultArchiveActionSource(t *testing.T) {
	snapshot := aiTutorResultArchiveSnapshot("tarch_student_ai_tutor_result_001", "student_001")
	snapshot.SafeGuidanceOnly = false
	repo := &fakeTutoringRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_student_ai_tutor_result_001": aiTutorResultArchiveItem("tarch_student_ai_tutor_result_001", "student_001"),
		},
		resultArchiveSnapshot:   snapshot,
		resultArchiveSnapshotOK: true,
	}
	uc := usecase.NewCreateStudentAppAITutorRequest(repo, fixedIDs{id: "tutor_req_student_app"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: "tarch_student_ai_tutor_result_001",
		AnalysisGoal:         "continue guided practice",
		QuestionBankIntent:   domain.QuestionBankIntentGeneratePersonalizedCheck,
		LearningActionSource: domain.StudentAppAITutorLearningActionSource{
			SourceType:          domain.StudentAppAITutorLearningActionSourceResultArchive,
			ActionType:          domain.StudentAppArchiveItemLearningActionAITutorRequest,
			ResultArchiveStatus: domain.StudentAppAITutorResultArchiveStatusReady,
			RenderFormat:        domain.StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks,
			FollowUpDepth:       1,
		},
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateStudentAppAITutorRequestRejectsTamperedResultArchiveFollowUpDepth(t *testing.T) {
	snapshot := aiTutorResultArchiveSnapshot("tarch_student_ai_tutor_result_001", "student_001")
	snapshot.FollowUpDepth = 1
	repo := &fakeTutoringRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_student_ai_tutor_result_001": aiTutorResultArchiveItem("tarch_student_ai_tutor_result_001", "student_001"),
		},
		resultArchiveSnapshot:   snapshot,
		resultArchiveSnapshotOK: true,
	}
	uc := usecase.NewCreateStudentAppAITutorRequest(repo, fixedIDs{id: "tutor_req_student_app"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: "tarch_student_ai_tutor_result_001",
		AnalysisGoal:         "continue guided practice",
		QuestionBankIntent:   domain.QuestionBankIntentGeneratePersonalizedCheck,
		LearningActionSource: domain.StudentAppAITutorLearningActionSource{
			SourceType:          domain.StudentAppAITutorLearningActionSourceResultArchive,
			ActionType:          domain.StudentAppArchiveItemLearningActionAITutorRequest,
			ResultArchiveStatus: domain.StudentAppAITutorResultArchiveStatusReady,
			RenderFormat:        domain.StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks,
			FollowUpDepth:       1,
		},
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateStudentAppAITutorRequestRejectsMaxDepthResultArchiveFollowUp(t *testing.T) {
	snapshot := aiTutorResultArchiveSnapshot("tarch_student_ai_tutor_result_001", "student_001")
	snapshot.FollowUpDepth = 2
	repo := &fakeTutoringRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_student_ai_tutor_result_001": aiTutorResultArchiveItem("tarch_student_ai_tutor_result_001", "student_001"),
		},
		resultArchiveSnapshot:   snapshot,
		resultArchiveSnapshotOK: true,
	}
	uc := usecase.NewCreateStudentAppAITutorRequest(repo, fixedIDs{id: "tutor_req_student_app"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: "tarch_student_ai_tutor_result_001",
		AnalysisGoal:         "continue guided practice",
		QuestionBankIntent:   domain.QuestionBankIntentGeneratePersonalizedCheck,
		LearningActionSource: domain.StudentAppAITutorLearningActionSource{
			SourceType:          domain.StudentAppAITutorLearningActionSourceResultArchive,
			ActionType:          domain.StudentAppArchiveItemLearningActionAITutorRequest,
			ResultArchiveStatus: domain.StudentAppAITutorResultArchiveStatusReady,
			RenderFormat:        domain.StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks,
			FollowUpDepth:       2,
		},
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateStudentAppAITutorRequestRejectsTeachingOwnedArchive(t *testing.T) {
	repo := &fakeTutoringRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_teaching": {
				ID:           "tarch_teaching",
				OwnerType:    domain.OwnerTypeTeaching,
				MaterialType: domain.MaterialTypeTeachingMaterial,
				CreatedAt:    time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC),
			},
		},
	}
	uc := usecase.NewCreateStudentAppAITutorRequest(repo, fixedIDs{id: "tutor_req_student_app"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: "tarch_teaching",
		AnalysisGoal:         "explain weak skills",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateStudentAppAITutorRequestRejectsOtherStudentArchive(t *testing.T) {
	repo := &fakeTutoringRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_other": archiveItem("tarch_other", "student_002", time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewCreateStudentAppAITutorRequest(repo, fixedIDs{id: "tutor_req_student_app"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: "tarch_other",
		AnalysisGoal:         "explain weak skills",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d", repo.creates)
	}
}
