package domain_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeReadStudentAppQuestionBankDraftContentScopesOwnStudent(t *testing.T) {
	input, err := domain.NormalizeReadStudentAppQuestionBankDraftContentInput(
		domain.ReadStudentAppQuestionBankDraftContentInput{
			Principal:            studentPrincipal("student_001"),
			QuestionBankDraftRef: " local://question-bank-drafts/tutor_req_001.json ",
		},
	)
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppQuestionBankDraftContentInput returned error: %v", err)
	}
	if input.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", input.StudentID)
	}
	if input.QuestionBankDraftRef != "local://question-bank-drafts/tutor_req_001.json" {
		t.Fatalf("QuestionBankDraftRef = %q", input.QuestionBankDraftRef)
	}
}

func TestNormalizeReadStudentAppQuestionBankDraftContentRejectsUnsafeInput(t *testing.T) {
	_, badPrincipalErr := domain.NormalizeReadStudentAppQuestionBankDraftContentInput(
		domain.ReadStudentAppQuestionBankDraftContentInput{
			Principal:            remoteSocialPrincipal(),
			QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_001.json",
		},
	)
	if !errors.Is(badPrincipalErr, domain.ErrForbidden) {
		t.Fatalf("bad principal error = %v, want ErrForbidden", badPrincipalErr)
	}

	_, badRefErr := domain.NormalizeReadStudentAppQuestionBankDraftContentInput(
		domain.ReadStudentAppQuestionBankDraftContentInput{
			Principal:            studentPrincipal("student_001"),
			QuestionBankDraftRef: "https://cdn.example.com/tutor_req_001.json",
		},
	)
	if !errors.Is(badRefErr, domain.ErrValidation) {
		t.Fatalf("bad ref error = %v, want ErrValidation", badRefErr)
	}
}

func TestNormalizeQuestionBankDraftContentValidatesLinkedContent(t *testing.T) {
	content, err := domain.NormalizeQuestionBankDraftContent(questionBankDraftContentFixture())
	if err != nil {
		t.Fatalf("NormalizeQuestionBankDraftContent returned error: %v", err)
	}
	if content.Status != domain.QuestionBankDraftContentStatusDraft {
		t.Fatalf("Status = %q", content.Status)
	}
	if content.Items[0].QuestionText != "What is 1/2 + 1/4?" {
		t.Fatalf("QuestionText = %q", content.Items[0].QuestionText)
	}
	if content.Items[0].LearningTarget != "fraction addition" {
		t.Fatalf("LearningTarget = %q", content.Items[0].LearningTarget)
	}
}

func TestNormalizeQuestionBankDraftContentRejectsBrokenLinkage(t *testing.T) {
	content := questionBankDraftContentFixture()
	content.QuestionBankDraftRef = "local://question-bank-drafts/tutor_req_other.json"

	_, err := domain.NormalizeQuestionBankDraftContent(content)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestNormalizeQuestionBankDraftContentRejectsDuplicateItemsAndOversize(t *testing.T) {
	content := questionBankDraftContentFixture()
	content.Items = append(content.Items, content.Items[0])
	_, duplicateErr := domain.NormalizeQuestionBankDraftContent(content)
	if !errors.Is(duplicateErr, domain.ErrValidation) {
		t.Fatalf("duplicate error = %v, want ErrValidation", duplicateErr)
	}

	content = questionBankDraftContentFixture()
	content.Items[0].Explanation = strings.Repeat("x", 4001)
	_, oversizeErr := domain.NormalizeQuestionBankDraftContent(content)
	if !errors.Is(oversizeErr, domain.ErrValidation) {
		t.Fatalf("oversize error = %v, want ErrValidation", oversizeErr)
	}
}

func TestBuildStudentAppQuestionBankDraftContentRejectsCrossStudentContent(t *testing.T) {
	input, err := domain.NormalizeReadStudentAppQuestionBankDraftContentInput(
		domain.ReadStudentAppQuestionBankDraftContentInput{
			Principal:            studentPrincipal("student_001"),
			QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_001.json",
		},
	)
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppQuestionBankDraftContentInput returned error: %v", err)
	}
	content := questionBankDraftContentFixture()
	content.StudentID = "student_002"

	_, err = domain.BuildStudentAppQuestionBankDraftContent(input, content)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
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
				QuestionText:   " What is 1/2 + 1/4? ",
				ExpectedAnswer: "3/4",
				Explanation:    "Use a common denominator of 4.",
				LearningTarget: " fraction addition ",
			},
		},
		CreatedAt: createdAt,
		UpdatedAt: createdAt.Add(5 * time.Minute),
	}
}
