package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadStudentAppQuestionBankDraftContentReturnsOwnDraftContent(t *testing.T) {
	reader := &fakeQuestionBankDraftContentReader{content: questionBankDraftContentFixture()}
	uc := usecase.NewReadStudentAppQuestionBankDraftContent(reader)

	content, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftContentInput{
		Principal:            studentPrincipal("student_001"),
		QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_001.json",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if reader.draftRef != "local://question-bank-drafts/tutor_req_001.json" {
		t.Fatalf("draftRef = %q", reader.draftRef)
	}
	if reader.studentID != "student_001" {
		t.Fatalf("studentID = %q", reader.studentID)
	}
	if len(content.Items) != 1 || content.Items[0].ExpectedAnswer != "3/4" {
		t.Fatalf("content items = %#v", content.Items)
	}
}

func TestReadStudentAppQuestionBankDraftContentRejectsForbiddenWithoutRead(t *testing.T) {
	reader := &fakeQuestionBankDraftContentReader{content: questionBankDraftContentFixture()}
	uc := usecase.NewReadStudentAppQuestionBankDraftContent(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftContentInput{
		Principal:            remotePrincipal(),
		QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_001.json",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.reads != 0 {
		t.Fatalf("reads = %d, want 0", reader.reads)
	}
}

func TestReadStudentAppQuestionBankDraftContentRejectsCrossStudentRepositoryLeak(t *testing.T) {
	content := questionBankDraftContentFixture()
	content.StudentID = "student_002"
	reader := &fakeQuestionBankDraftContentReader{content: content}
	uc := usecase.NewReadStudentAppQuestionBankDraftContent(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftContentInput{
		Principal:            studentPrincipal("student_001"),
		QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_001.json",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestReadStudentAppQuestionBankDraftContentReturnsNotFound(t *testing.T) {
	reader := &fakeQuestionBankDraftContentReader{}
	uc := usecase.NewReadStudentAppQuestionBankDraftContent(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftContentInput{
		Principal:            studentPrincipal("student_001"),
		QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_001.json",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
}

type fakeQuestionBankDraftContentReader struct {
	content   domain.QuestionBankDraftContent
	draftRef  string
	studentID string
	reads     int
}

func (f *fakeQuestionBankDraftContentReader) GetQuestionBankDraftContentForStudent(
	_ context.Context,
	draftRef string,
	studentID string,
) (domain.QuestionBankDraftContent, bool, error) {
	f.draftRef = draftRef
	f.studentID = studentID
	f.reads++
	if f.content.QuestionBankDraftRef == "" {
		return domain.QuestionBankDraftContent{}, false, nil
	}
	return f.content, true, nil
}

func questionBankDraftContentFixture() domain.QuestionBankDraftContent {
	createdAt := time.Date(2026, 6, 6, 9, 0, 0, 0, time.UTC)
	return domain.QuestionBankDraftContent{
		QuestionBankDraftRef:      "local://question-bank-drafts/tutor_req_001.json",
		TutoringAnalysisRequestID: "tutor_req_001",
		ArchiveItemID:             "tarch_001",
		StudentID:                 "student_001",
		SourceArchiveMaterial:     domain.MaterialTypeQuiz,
		ResultSummary:             "fractions need targeted practice",
		Items: []domain.QuestionBankDraftItem{
			{
				ID:             "q_001",
				QuestionText:   "What is 1/2 + 1/4?",
				ExpectedAnswer: "3/4",
				Explanation:    "Use a common denominator of 4.",
				LearningTarget: "fraction addition",
			},
		},
		CreatedAt: createdAt,
		UpdatedAt: createdAt.Add(5 * time.Minute),
	}
}
