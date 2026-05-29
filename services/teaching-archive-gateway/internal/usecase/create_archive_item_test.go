package usecase_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestCreateStudentArchiveItemNormalizesAndPersistsMetadata(t *testing.T) {
	repo := &fakeRepository{}
	now := time.Date(2026, 5, 29, 9, 0, 0, 0, time.UTC)
	uc := usecase.NewCreateArchiveItem(repo, fixedIDs{id: "tarch_fixed"}, fixedClock{now: now})

	got, err := uc.Execute(context.Background(), domain.CreateArchiveItemInput{
		Principal:       teacherPrincipal(),
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       " student_001 ",
		MaterialType:    domain.MaterialTypeQuiz,
		Title:           "  Week 3 Quiz  ",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      " local://archive/student_001/quiz_001.pdf ",
		Tags:            []string{" math ", "quiz"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentTutoring, domain.AnalysisIntentAIGrading},
		OCRReserved:     true,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if got.ID != "tarch_fixed" {
		t.Fatalf("ID = %q", got.ID)
	}
	if got.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", got.StudentID)
	}
	if got.Title != "Week 3 Quiz" {
		t.Fatalf("Title = %q", got.Title)
	}
	if got.ContentRef != "local://archive/student_001/quiz_001.pdf" {
		t.Fatalf("ContentRef = %q", got.ContentRef)
	}
	if !reflect.DeepEqual(got.Tags, []string{"math", "quiz"}) {
		t.Fatalf("Tags = %#v", got.Tags)
	}
	if got.OCRStatus != domain.OCRStatusReserved {
		t.Fatalf("OCRStatus = %q", got.OCRStatus)
	}
	if got.CreatedAt != now {
		t.Fatalf("CreatedAt = %s", got.CreatedAt)
	}
	if repo.created.ID != got.ID {
		t.Fatal("repository did not receive created archive item")
	}
}

func TestCreateTeachingMaterialDoesNotRequireStudentID(t *testing.T) {
	uc := usecase.NewCreateArchiveItem(&fakeRepository{}, fixedIDs{id: "tarch_fixed"}, fixedClock{})

	got, err := uc.Execute(context.Background(), domain.CreateArchiveItemInput{
		Principal:       teacherPrincipal(),
		OwnerType:       domain.OwnerTypeTeaching,
		MaterialType:    domain.MaterialTypeTeachingMaterial,
		Title:           "Lesson Plan",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://archive/teaching/lesson-plan.pdf",
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if got.StudentID != "" {
		t.Fatalf("StudentID = %q", got.StudentID)
	}
	if got.OCRStatus != domain.OCRStatusNotRequired {
		t.Fatalf("OCRStatus = %q", got.OCRStatus)
	}
}

func TestCreateArchiveItemAllowsAdminAllStudentArchiveWrite(t *testing.T) {
	repo := &fakeRepository{}
	uc := usecase.NewCreateArchiveItem(repo, fixedIDs{id: "tarch_admin"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateArchiveItemInput{
		Principal:       adminPrincipal(),
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       "student_777",
		MaterialType:    domain.MaterialTypePaper,
		Title:           "Diagnostic Paper",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://archive/student_777/paper.pdf",
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if repo.creates != 1 {
		t.Fatalf("repository creates = %d", repo.creates)
	}
}

func TestCreateArchiveItemAllowsStudentOwnArchiveWriteOnlyForSelf(t *testing.T) {
	repo := &fakeRepository{}
	uc := usecase.NewCreateArchiveItem(repo, fixedIDs{id: "tarch_student"}, fixedClock{})

	_, ownErr := uc.Execute(context.Background(), domain.CreateArchiveItemInput{
		Principal:       studentPrincipal("student_001"),
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       "student_001",
		MaterialType:    domain.MaterialTypeHomework,
		Title:           "Homework",
		Source:          domain.SourceStudentUpload,
		ContentRef:      "local://archive/student_001/homework.pdf",
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentTutoring},
	})
	if ownErr != nil {
		t.Fatalf("own archive write error: %v", ownErr)
	}

	_, otherErr := uc.Execute(context.Background(), domain.CreateArchiveItemInput{
		Principal:       studentPrincipal("student_001"),
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       "student_002",
		MaterialType:    domain.MaterialTypeHomework,
		Title:           "Homework",
		Source:          domain.SourceStudentUpload,
		ContentRef:      "local://archive/student_002/homework.pdf",
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentTutoring},
	})
	if !errors.Is(otherErr, domain.ErrForbidden) {
		t.Fatalf("other archive write error = %v, want ErrForbidden", otherErr)
	}
	if repo.creates != 1 {
		t.Fatalf("repository creates = %d", repo.creates)
	}
}

func TestCreateArchiveItemRejectsRemoteSocialPrincipal(t *testing.T) {
	repo := &fakeRepository{}
	uc := usecase.NewCreateArchiveItem(repo, fixedIDs{id: "tarch_remote"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateArchiveItemInput{
		Principal:       remotePrincipal(),
		OwnerType:       domain.OwnerTypeTeaching,
		MaterialType:    domain.MaterialTypeTeachingMaterial,
		Title:           "Lesson Plan",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://archive/teaching/lesson-plan.pdf",
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.creates != 0 {
		t.Fatalf("repository creates = %d", repo.creates)
	}
}

func TestCreateStudentArchiveItemRequiresStudentID(t *testing.T) {
	uc := usecase.NewCreateArchiveItem(&fakeRepository{}, fixedIDs{id: "tarch_fixed"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateArchiveItemInput{
		Principal:       teacherPrincipal(),
		OwnerType:       domain.OwnerTypeStudent,
		MaterialType:    domain.MaterialTypeHomework,
		Title:           "Homework",
		Source:          domain.SourceStudentUpload,
		ContentRef:      "local://archive/student/homework.pdf",
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentTutoring},
	})

	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestCreateArchiveItemRejectsUnsupportedMaterialTypeAndIntent(t *testing.T) {
	uc := usecase.NewCreateArchiveItem(&fakeRepository{}, fixedIDs{id: "tarch_fixed"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateArchiveItemInput{
		Principal:       teacherPrincipal(),
		OwnerType:       domain.OwnerTypeTeaching,
		MaterialType:    domain.MaterialType("SCREENSHOT"),
		Title:           "Legacy Screenshot",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://archive/legacy/screenshot.png",
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntent("UNKNOWN")},
	})

	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestCreateArchiveItemRejectsInvalidStudentIDAndTags(t *testing.T) {
	uc := usecase.NewCreateArchiveItem(&fakeRepository{}, fixedIDs{id: "tarch_fixed"}, fixedClock{})

	_, longStudentErr := uc.Execute(context.Background(), domain.CreateArchiveItemInput{
		Principal:       teacherPrincipal(),
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       strings.Repeat("s", 129),
		MaterialType:    domain.MaterialTypeQuiz,
		Title:           "Quiz",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://archive/student/quiz.pdf",
		Tags:            []string{"math"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentTutoring},
	})
	if !errors.Is(longStudentErr, domain.ErrValidation) {
		t.Fatalf("long studentId error = %v, want ErrValidation", longStudentErr)
	}

	_, blankTagErr := uc.Execute(context.Background(), domain.CreateArchiveItemInput{
		Principal:       teacherPrincipal(),
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       "student_001",
		MaterialType:    domain.MaterialTypeQuiz,
		Title:           "Quiz",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://archive/student/quiz.pdf",
		Tags:            []string{"math", ""},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentTutoring},
	})
	if !errors.Is(blankTagErr, domain.ErrValidation) {
		t.Fatalf("blank tag error = %v, want ErrValidation", blankTagErr)
	}
}

func TestCreateArchiveItemRequiresPrefixedServerID(t *testing.T) {
	uc := usecase.NewCreateArchiveItem(&fakeRepository{}, fixedIDs{id: "bad_id"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateArchiveItemInput{
		Principal:       teacherPrincipal(),
		OwnerType:       domain.OwnerTypeTeaching,
		MaterialType:    domain.MaterialTypeTeachingMaterial,
		Title:           "Lesson Plan",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://archive/teaching/lesson-plan.pdf",
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
	})

	if err == nil {
		t.Fatal("expected generated id prefix validation error")
	}
}

type fakeRepository struct {
	created domain.ArchiveItem
	creates int
}

func (f *fakeRepository) Create(_ context.Context, item domain.ArchiveItem) error {
	f.created = item
	f.creates++
	return nil
}

type fixedIDs struct {
	id string
}

func (f fixedIDs) NewID() string {
	return f.id
}

type fixedClock struct {
	now time.Time
}

func (f fixedClock) Now() time.Time {
	if f.now.IsZero() {
		return time.Date(2026, 5, 29, 0, 0, 0, 0, time.UTC)
	}
	return f.now
}
