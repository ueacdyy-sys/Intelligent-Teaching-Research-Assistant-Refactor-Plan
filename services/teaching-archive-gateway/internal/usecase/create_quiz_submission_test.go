package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestCreateQuizSubmissionAllowsStudentOwnSubmission(t *testing.T) {
	repo := &fakeQuizSubmissionRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_quiz": teachingQuizItem("tarch_quiz", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewCreateQuizSubmission(
		repo,
		fixedIDs{id: "quiz_sub_fixed"},
		fixedClock{now: time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC)},
	)

	got, err := uc.Execute(context.Background(), domain.CreateQuizSubmissionInput{
		Principal:         studentPrincipal("student_001"),
		QuizArchiveItemID: " tarch_quiz ",
		AnswerRef:         " local://answers/student_001/week-3.json ",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if got.ID != "quiz_sub_fixed" {
		t.Fatalf("ID = %q", got.ID)
	}
	if got.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", got.StudentID)
	}
	if repo.gets != 1 {
		t.Fatalf("gets = %d, want 1", repo.gets)
	}
	if repo.creates != 1 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateQuizSubmissionFastPathSkipsArchiveLookupForAuthorizedTeachingQuiz(t *testing.T) {
	repo := &fakeQuizSubmissionRepository{fastCreateOK: true}
	uc := usecase.NewCreateQuizSubmission(
		repo,
		fixedIDs{id: "quiz_sub_fixed"},
		fixedClock{now: time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC)},
	)

	got, err := uc.Execute(context.Background(), domain.CreateQuizSubmissionInput{
		Principal:         studentPrincipal("student_001"),
		QuizArchiveItemID: " tarch_quiz ",
		AnswerRef:         " local://answers/student_001/week-3.json ",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if got.ID != "quiz_sub_fixed" {
		t.Fatalf("ID = %q", got.ID)
	}
	if repo.gets != 0 {
		t.Fatalf("gets = %d, want 0", repo.gets)
	}
	if repo.fastCreates != 1 {
		t.Fatalf("fastCreates = %d, want 1", repo.fastCreates)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d, want 0", repo.creates)
	}
	if repo.fastSubmission.QuizArchiveItemID != "tarch_quiz" {
		t.Fatalf("fast submission archive item = %q", repo.fastSubmission.QuizArchiveItemID)
	}
}

func TestCreateQuizSubmissionFastPathMissFallsBackToNonQuizValidation(t *testing.T) {
	item := teachingQuizItem("tarch_handout", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC))
	item.MaterialType = domain.MaterialTypeHandout
	repo := &fakeQuizSubmissionRepository{
		items: map[string]domain.ArchiveItem{"tarch_handout": item},
	}
	uc := usecase.NewCreateQuizSubmission(repo, fixedIDs{id: "quiz_sub_fixed"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateQuizSubmissionInput{
		Principal:         studentPrincipal("student_001"),
		QuizArchiveItemID: "tarch_handout",
		AnswerRef:         "local://answers/student_001/week-3.json",
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
	if repo.fastCreates != 1 {
		t.Fatalf("fastCreates = %d, want 1", repo.fastCreates)
	}
	if repo.gets != 1 {
		t.Fatalf("gets = %d, want 1", repo.gets)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateQuizSubmissionFastPathMissFallsBackToNotFound(t *testing.T) {
	repo := &fakeQuizSubmissionRepository{items: map[string]domain.ArchiveItem{}}
	uc := usecase.NewCreateQuizSubmission(repo, fixedIDs{id: "quiz_sub_fixed"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateQuizSubmissionInput{
		Principal:         studentPrincipal("student_001"),
		QuizArchiveItemID: "tarch_missing",
		AnswerRef:         "local://answers/student_001/week-3.json",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
	if repo.fastCreates != 1 {
		t.Fatalf("fastCreates = %d, want 1", repo.fastCreates)
	}
	if repo.gets != 1 {
		t.Fatalf("gets = %d, want 1", repo.gets)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateQuizSubmissionRejectsOtherStudentBeforeCreate(t *testing.T) {
	repo := &fakeQuizSubmissionRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_quiz": teachingQuizItem("tarch_quiz", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewCreateQuizSubmission(repo, fixedIDs{id: "quiz_sub_fixed"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateQuizSubmissionInput{
		Principal:         studentPrincipal("student_001"),
		QuizArchiveItemID: "tarch_quiz",
		StudentID:         "student_002",
		AnswerRef:         "local://answers/student_002/week-3.json",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.gets != 1 {
		t.Fatalf("gets = %d, want 1", repo.gets)
	}
	if repo.fastCreates != 0 {
		t.Fatalf("fastCreates = %d, want 0", repo.fastCreates)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateQuizSubmissionRejectsNonQuizArchive(t *testing.T) {
	item := teachingQuizItem("tarch_handout", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC))
	item.MaterialType = domain.MaterialTypeHandout
	repo := &fakeQuizSubmissionRepository{items: map[string]domain.ArchiveItem{"tarch_handout": item}}
	uc := usecase.NewCreateQuizSubmission(repo, fixedIDs{id: "quiz_sub_fixed"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateQuizSubmissionInput{
		Principal:         studentPrincipal("student_001"),
		QuizArchiveItemID: "tarch_handout",
		AnswerRef:         "local://answers/student_001/week-3.json",
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

type fakeQuizSubmissionRepository struct {
	items          map[string]domain.ArchiveItem
	submissions    []domain.QuizSubmission
	gets           int
	lists          int
	creates        int
	listQuery      domain.QuizSubmissionQuery
	submission     domain.QuizSubmission
	createdGrading domain.AIGradingRequest
	gradingCreates int
	fastSubmission domain.QuizSubmission
	fastCreates    int
	fastCreateOK   bool
}

func (f *fakeQuizSubmissionRepository) GetByID(_ context.Context, id string) (domain.ArchiveItem, bool, error) {
	f.gets++
	item, ok := f.items[id]
	return item, ok, nil
}

func (f *fakeQuizSubmissionRepository) CreateQuizSubmission(
	_ context.Context,
	submission domain.QuizSubmission,
) (usecase.WritePersistenceOutcome, error) {
	f.submission = submission
	f.creates++
	return usecase.PersistedWriteOutcome(), nil
}

func (f *fakeQuizSubmissionRepository) CreateQuizSubmissionForExistingTeachingQuiz(
	_ context.Context,
	submission domain.QuizSubmission,
) (bool, usecase.WritePersistenceOutcome, error) {
	f.fastSubmission = submission
	f.fastCreates++
	if !f.fastCreateOK {
		return false, usecase.WritePersistenceOutcome{}, nil
	}
	return true, usecase.PersistedWriteOutcome(), nil
}

func (f *fakeQuizSubmissionRepository) GetQuizSubmissionByID(
	_ context.Context,
	id string,
) (domain.QuizSubmission, bool, error) {
	for _, submission := range f.submissions {
		if submission.ID == id {
			return submission, true, nil
		}
	}
	return domain.QuizSubmission{}, false, nil
}

func (f *fakeQuizSubmissionRepository) CreateAIGradingRequest(
	_ context.Context,
	request domain.AIGradingRequest,
) error {
	f.createdGrading = request
	f.gradingCreates++
	return nil
}

func (f *fakeQuizSubmissionRepository) ListQuizSubmissions(
	_ context.Context,
	query domain.QuizSubmissionQuery,
) ([]domain.QuizSubmission, error) {
	f.listQuery = query
	f.lists++
	submissions := make([]domain.QuizSubmission, 0, len(f.submissions))
	for _, submission := range f.submissions {
		if query.QuizArchiveItemID != "" && submission.QuizArchiveItemID != query.QuizArchiveItemID {
			continue
		}
		if query.StudentID != "" && submission.StudentID != query.StudentID {
			continue
		}
		if len(query.StudentIDs) > 0 && !containsString(query.StudentIDs, submission.StudentID) {
			continue
		}
		submissions = append(submissions, submission)
		if query.FetchLimit > 0 && len(submissions) >= query.FetchLimit {
			break
		}
	}
	return submissions, nil
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func teachingQuizItem(id string, createdAt time.Time) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              id,
		OwnerType:       domain.OwnerTypeTeaching,
		MaterialType:    domain.MaterialTypeQuiz,
		Title:           "Week 3 Quiz",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://teaching/quizzes/week-3.pdf",
		Tags:            []string{"math"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
		OCRStatus:       domain.OCRStatusNotRequired,
		CreatedAt:       createdAt,
	}
}
