package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestCreateAIGradingRequestAllowsStudentOwnArchive(t *testing.T) {
	repo := &fakeAIGradingRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_student": aiGradingArchiveItem("tarch_student", "student_001", time.Date(2026, 5, 29, 17, 0, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewCreateAIGradingRequest(repo, fixedIDs{id: "grading_req_fixed"}, fixedClock{})

	got, err := uc.Execute(context.Background(), domain.CreateAIGradingRequestInput{
		Principal:           studentPrincipal("student_001"),
		ArchiveItemID:       " tarch_student ",
		GradingInstructions: "grade my quiz",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if got.ID != "grading_req_fixed" {
		t.Fatalf("ID = %q", got.ID)
	}
	if got.SourceArchiveStudentID != "student_001" {
		t.Fatalf("SourceArchiveStudentID = %q", got.SourceArchiveStudentID)
	}
	if repo.creates != 1 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateAIGradingRequestAllowsTeacherAssignedArchive(t *testing.T) {
	repo := &fakeAIGradingRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_student": aiGradingArchiveItem("tarch_student", "student_001", time.Date(2026, 5, 29, 17, 0, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewCreateAIGradingRequest(repo, fixedIDs{id: "grading_req_fixed"}, fixedClock{})

	got, err := uc.Execute(context.Background(), domain.CreateAIGradingRequestInput{
		Principal:           teacherPrincipal(),
		ArchiveItemID:       "tarch_student",
		GradingInstructions: "grade assigned quiz",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if got.RequestedByPrincipalID != "teacher_001" {
		t.Fatalf("RequestedByPrincipalID = %q", got.RequestedByPrincipalID)
	}
	if repo.creates != 1 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateAIGradingRequestRejectsOtherStudentArchive(t *testing.T) {
	repo := &fakeAIGradingRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_other": aiGradingArchiveItem("tarch_other", "student_002", time.Date(2026, 5, 29, 17, 0, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewCreateAIGradingRequest(repo, fixedIDs{id: "grading_req_fixed"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateAIGradingRequestInput{
		Principal:           studentPrincipal("student_001"),
		ArchiveItemID:       "tarch_other",
		GradingInstructions: "grade my quiz",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateAIGradingRequestRejectsArchiveWithoutAIGradingIntent(t *testing.T) {
	item := aiGradingArchiveItem("tarch_plain", "student_001", time.Date(2026, 5, 29, 17, 0, 0, 0, time.UTC))
	item.AnalysisIntents = []domain.AnalysisIntent{domain.AnalysisIntentTutoring}
	item.OCRStatus = domain.OCRStatusNotRequired
	repo := &fakeAIGradingRepository{items: map[string]domain.ArchiveItem{"tarch_plain": item}}
	uc := usecase.NewCreateAIGradingRequest(repo, fixedIDs{id: "grading_req_fixed"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateAIGradingRequestInput{
		Principal:           studentPrincipal("student_001"),
		ArchiveItemID:       "tarch_plain",
		GradingInstructions: "grade my quiz",
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

type fakeAIGradingRepository struct {
	items   map[string]domain.ArchiveItem
	creates int
}

func (f *fakeAIGradingRepository) GetByID(_ context.Context, id string) (domain.ArchiveItem, bool, error) {
	item, ok := f.items[id]
	return item, ok, nil
}

func (f *fakeAIGradingRepository) CreateAIGradingRequest(_ context.Context, _ domain.AIGradingRequest) error {
	f.creates++
	return nil
}

func aiGradingArchiveItem(id string, studentID string, createdAt time.Time) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              id,
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       studentID,
		MaterialType:    domain.MaterialTypeQuiz,
		Title:           "Quiz",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://archive/student/quiz.pdf",
		Tags:            []string{"math"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentAIGrading},
		OCRStatus:       domain.OCRStatusReserved,
		CreatedAt:       createdAt,
	}
}
