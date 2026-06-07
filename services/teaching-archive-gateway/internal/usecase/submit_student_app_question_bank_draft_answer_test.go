package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestSubmitStudentAppQuestionBankDraftAnswerPersistsOwnDraftAnswer(t *testing.T) {
	repo := &fakeQuestionBankDraftAnswerSubmissionRepository{content: questionBankDraftContentFixture()}
	uc := usecase.NewSubmitStudentAppQuestionBankDraftAnswer(
		repo,
		fixedIDs{id: "qbank_ans_sub_fixed"},
		fixedClock{now: time.Date(2026, 6, 6, 9, 30, 0, 0, time.UTC)},
	)

	result, err := uc.ExecuteWithPersistence(context.Background(), domain.SubmitStudentAppQuestionBankDraftAnswerInput{
		Principal:            studentPrincipal("student_001"),
		QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_001.json",
		Answers: []domain.QuestionBankDraftSubmittedAnswer{
			{ItemID: "q_001", AnswerText: " 3/4 "},
		},
	})
	if err != nil {
		t.Fatalf("ExecuteWithPersistence returned error: %v", err)
	}
	if repo.draftRef != "local://question-bank-drafts/tutor_req_001.json" || repo.studentID != "student_001" {
		t.Fatalf("scoped lookup = %q/%q", repo.draftRef, repo.studentID)
	}
	if repo.writes != 1 {
		t.Fatalf("writes = %d, want 1", repo.writes)
	}
	if result.Submission.ID != "qbank_ans_sub_fixed" {
		t.Fatalf("submission id = %q", result.Submission.ID)
	}
	if result.Submission.Answers[0].AnswerText != "3/4" {
		t.Fatalf("answer text = %q", result.Submission.Answers[0].AnswerText)
	}
	if result.Persistence.Status != usecase.PersistenceStatusPersisted {
		t.Fatalf("persistence = %#v", result.Persistence)
	}
}

func TestSubmitStudentAppQuestionBankDraftAnswerRejectsForbiddenBeforeRead(t *testing.T) {
	repo := &fakeQuestionBankDraftAnswerSubmissionRepository{content: questionBankDraftContentFixture()}
	uc := usecase.NewSubmitStudentAppQuestionBankDraftAnswer(repo, fixedIDs{id: "qbank_ans_sub_fixed"}, fixedClock{})

	_, err := uc.ExecuteWithPersistence(context.Background(), domain.SubmitStudentAppQuestionBankDraftAnswerInput{
		Principal:            remotePrincipal(),
		QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_001.json",
		Answers: []domain.QuestionBankDraftSubmittedAnswer{
			{ItemID: "q_001", AnswerText: "3/4"},
		},
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.reads != 0 || repo.writes != 0 {
		t.Fatalf("reads/writes = %d/%d, want 0/0", repo.reads, repo.writes)
	}
}

func TestSubmitStudentAppQuestionBankDraftAnswerReturnsNotFoundForMissingScopedContent(t *testing.T) {
	repo := &fakeQuestionBankDraftAnswerSubmissionRepository{}
	uc := usecase.NewSubmitStudentAppQuestionBankDraftAnswer(repo, fixedIDs{id: "qbank_ans_sub_fixed"}, fixedClock{})

	_, err := uc.ExecuteWithPersistence(context.Background(), domain.SubmitStudentAppQuestionBankDraftAnswerInput{
		Principal:            studentPrincipal("student_001"),
		QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_001.json",
		Answers: []domain.QuestionBankDraftSubmittedAnswer{
			{ItemID: "q_001", AnswerText: "3/4"},
		},
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
	if repo.reads != 1 || repo.writes != 0 {
		t.Fatalf("reads/writes = %d/%d, want 1/0", repo.reads, repo.writes)
	}
}

func TestSubmitStudentAppQuestionBankDraftAnswerRejectsUnknownItemBeforePersist(t *testing.T) {
	repo := &fakeQuestionBankDraftAnswerSubmissionRepository{content: questionBankDraftContentFixture()}
	uc := usecase.NewSubmitStudentAppQuestionBankDraftAnswer(repo, fixedIDs{id: "qbank_ans_sub_fixed"}, fixedClock{})

	_, err := uc.ExecuteWithPersistence(context.Background(), domain.SubmitStudentAppQuestionBankDraftAnswerInput{
		Principal:            studentPrincipal("student_001"),
		QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_001.json",
		Answers: []domain.QuestionBankDraftSubmittedAnswer{
			{ItemID: "q_missing", AnswerText: "3/4"},
		},
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
	if repo.reads != 1 || repo.writes != 0 {
		t.Fatalf("reads/writes = %d/%d, want 1/0", repo.reads, repo.writes)
	}
}

type fakeQuestionBankDraftAnswerSubmissionRepository struct {
	content    domain.QuestionBankDraftContent
	draftRef   string
	studentID  string
	submission domain.QuestionBankDraftAnswerSubmission
	reads      int
	writes     int
}

func (f *fakeQuestionBankDraftAnswerSubmissionRepository) GetQuestionBankDraftContentForStudent(
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

func (f *fakeQuestionBankDraftAnswerSubmissionRepository) SubmitQuestionBankDraftAnswerSubmission(
	_ context.Context,
	submission domain.QuestionBankDraftAnswerSubmission,
) (usecase.WritePersistenceOutcome, error) {
	f.submission = submission
	f.writes++
	return usecase.PersistedWriteOutcome(), nil
}
