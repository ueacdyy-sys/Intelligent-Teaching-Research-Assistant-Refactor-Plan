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
