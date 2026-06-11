package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadStudentAppQuestionBankDraftAnswerFeedbackReturnsSafeOwnCard(t *testing.T) {
	repo := &fakeQuestionBankDraftAnswerFeedbackRepository{
		submission: questionBankDraftAnswerSubmissionForFeedbackRead("qbank_ans_sub_001", "student_001"),
		snapshot:   questionBankDraftAnswerFeedbackReadSnapshot("tarch_student_feedback_001", "qbank_ans_sub_001", "student_001"),
		item:       questionBankDraftAnswerFeedbackReadArchiveItem("tarch_student_feedback_001", "student_001"),
	}
	uc := usecase.NewReadStudentAppQuestionBankDraftAnswerFeedback(repo)

	card, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput{
		Principal:    studentPrincipal("student_001"),
		SubmissionID: " qbank_ans_sub_001 ",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if card.Status != domain.StudentAppQuestionBankDraftAnswerFeedbackStatusReady ||
		card.SubmissionID != "qbank_ans_sub_001" ||
		card.FeedbackArchiveItemID != "tarch_student_feedback_001" ||
		card.LearnerFeedback.Summary == "" {
		t.Fatalf("card = %#v", card)
	}
	if repo.submissionID != "qbank_ans_sub_001" ||
		repo.submissionStudentID != "student_001" ||
		repo.snapshotSubmissionID != "qbank_ans_sub_001" ||
		repo.snapshotStudentID != "student_001" ||
		repo.archiveItemID != "tarch_student_feedback_001" {
		t.Fatalf("repo lookups = %#v", repo)
	}
}

func TestReadStudentAppQuestionBankDraftAnswerFeedbackRejectsForbiddenBeforeRepository(t *testing.T) {
	repo := &fakeQuestionBankDraftAnswerFeedbackRepository{
		submission: questionBankDraftAnswerSubmissionForFeedbackRead("qbank_ans_sub_001", "student_001"),
		snapshot:   questionBankDraftAnswerFeedbackReadSnapshot("tarch_student_feedback_001", "qbank_ans_sub_001", "student_001"),
		item:       questionBankDraftAnswerFeedbackReadArchiveItem("tarch_student_feedback_001", "student_001"),
	}
	uc := usecase.NewReadStudentAppQuestionBankDraftAnswerFeedback(repo)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput{
		Principal:    teacherPrincipal(),
		SubmissionID: "qbank_ans_sub_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.submissionReads != 0 || repo.snapshotReads != 0 || repo.archiveReads != 0 {
		t.Fatalf("repo calls = %d/%d/%d, want 0/0/0", repo.submissionReads, repo.snapshotReads, repo.archiveReads)
	}
}

func TestReadStudentAppQuestionBankDraftAnswerFeedbackReturnsNotFoundForMissingPieces(t *testing.T) {
	uc := usecase.NewReadStudentAppQuestionBankDraftAnswerFeedback(&fakeQuestionBankDraftAnswerFeedbackRepository{})
	_, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput{
		Principal:    studentPrincipal("student_001"),
		SubmissionID: "qbank_ans_sub_001",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("missing submission error = %v, want ErrNotFound", err)
	}

	repo := &fakeQuestionBankDraftAnswerFeedbackRepository{
		submission: questionBankDraftAnswerSubmissionForFeedbackRead("qbank_ans_sub_001", "student_001"),
	}
	uc = usecase.NewReadStudentAppQuestionBankDraftAnswerFeedback(repo)
	_, err = uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput{
		Principal:    studentPrincipal("student_001"),
		SubmissionID: "qbank_ans_sub_001",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("missing snapshot error = %v, want ErrNotFound", err)
	}

	repo.snapshot = questionBankDraftAnswerFeedbackReadSnapshot("tarch_student_feedback_001", "qbank_ans_sub_001", "student_001")
	uc = usecase.NewReadStudentAppQuestionBankDraftAnswerFeedback(repo)
	_, err = uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput{
		Principal:    studentPrincipal("student_001"),
		SubmissionID: "qbank_ans_sub_001",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("missing archive item error = %v, want ErrNotFound", err)
	}
}

func TestReadStudentAppQuestionBankDraftAnswerFeedbackRejectsBrokenLineage(t *testing.T) {
	snapshot := questionBankDraftAnswerFeedbackReadSnapshot("tarch_student_feedback_001", "qbank_ans_sub_001", "student_001")
	snapshot.SourceArchiveItemID = "tarch_other_homework_001"
	repo := &fakeQuestionBankDraftAnswerFeedbackRepository{
		submission: questionBankDraftAnswerSubmissionForFeedbackRead("qbank_ans_sub_001", "student_001"),
		snapshot:   snapshot,
		item:       questionBankDraftAnswerFeedbackReadArchiveItem("tarch_student_feedback_001", "student_001"),
	}
	uc := usecase.NewReadStudentAppQuestionBankDraftAnswerFeedback(repo)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftAnswerFeedbackInput{
		Principal:    studentPrincipal("student_001"),
		SubmissionID: "qbank_ans_sub_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

type fakeQuestionBankDraftAnswerFeedbackRepository struct {
	submission           domain.QuestionBankDraftAnswerSubmission
	snapshot             domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot
	item                 domain.ArchiveItem
	submissionID         string
	submissionStudentID  string
	snapshotSubmissionID string
	snapshotStudentID    string
	archiveItemID        string
	submissionReads      int
	snapshotReads        int
	archiveReads         int
}

func (f *fakeQuestionBankDraftAnswerFeedbackRepository) GetQuestionBankDraftAnswerSubmissionForStudent(
	_ context.Context,
	submissionID string,
	studentID string,
) (domain.QuestionBankDraftAnswerSubmission, bool, error) {
	f.submissionReads++
	f.submissionID = submissionID
	f.submissionStudentID = studentID
	if f.submission.ID == "" {
		return domain.QuestionBankDraftAnswerSubmission{}, false, nil
	}
	return f.submission, f.submission.ID == submissionID && f.submission.StudentID == studentID, nil
}

func (f *fakeQuestionBankDraftAnswerFeedbackRepository) GetLatestQuestionBankDraftAnswerFeedbackArchiveSnapshotForStudent(
	_ context.Context,
	submissionID string,
	studentID string,
) (domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot, bool, error) {
	f.snapshotReads++
	f.snapshotSubmissionID = submissionID
	f.snapshotStudentID = studentID
	if f.snapshot.SubmissionID == "" {
		return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, false, nil
	}
	return f.snapshot, f.snapshot.SubmissionID == submissionID && f.snapshot.StudentID == studentID, nil
}

func (f *fakeQuestionBankDraftAnswerFeedbackRepository) GetByID(
	_ context.Context,
	id string,
) (domain.ArchiveItem, bool, error) {
	f.archiveReads++
	f.archiveItemID = id
	if f.item.ID == "" {
		return domain.ArchiveItem{}, false, nil
	}
	return f.item, f.item.ID == id, nil
}

func questionBankDraftAnswerSubmissionForFeedbackRead(
	id string,
	studentID string,
) domain.QuestionBankDraftAnswerSubmission {
	return domain.QuestionBankDraftAnswerSubmission{
		ID:                        id,
		QuestionBankDraftRef:      "local://question-bank-drafts/tutor_req_feedback_001.json",
		TutoringAnalysisRequestID: "tutor_req_feedback_001",
		ArchiveItemID:             "tarch_source_homework_001",
		StudentID:                 studentID,
		SubmittedByPrincipalID:    studentID,
		Status:                    domain.QuestionBankDraftAnswerSubmissionStatusSubmitted,
		Answers: []domain.QuestionBankDraftSubmittedAnswer{
			{ItemID: "q_001", AnswerText: "3/4"},
		},
		SubmittedAt: time.Date(2026, 6, 6, 9, 32, 0, 0, time.UTC),
	}
}

func questionBankDraftAnswerFeedbackReadArchiveItem(id string, studentID string) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              id,
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       studentID,
		MaterialType:    domain.MaterialTypeHomework,
		Title:           "Student AI Tutor feedback archive qbank_ans_sub_001",
		Source:          domain.SourceSystemImport,
		ContentRef:      "student-ai-tutor-feedback-archive:feedback_archive_cmd_qbank_001:sha256_4249595968f7ea8d603e6620d8f4abb688e52629b10fe0d9244627287fe18463",
		Tags:            []string{"student_app_ai_tutor", "feedback", "question_bank", "archive_commit"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly, domain.AnalysisIntentTutoring},
		OCRStatus:       domain.OCRStatusNotRequired,
		CreatedAt:       time.Date(2026, 6, 6, 10, 30, 0, 0, time.UTC),
	}
}

func questionBankDraftAnswerFeedbackReadSnapshot(
	feedbackArchiveItemID string,
	submissionID string,
	studentID string,
) domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot {
	return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{
		FeedbackArchiveItemID:     feedbackArchiveItemID,
		SubmissionID:              submissionID,
		StudentID:                 studentID,
		RequestID:                 "grading_req_qbank_answer_feedback_001",
		QuestionBankDraftRef:      "local://question-bank-drafts/tutor_req_feedback_001.json",
		TutoringAnalysisRequestID: "tutor_req_feedback_001",
		SourceArchiveItemID:       "tarch_source_homework_001",
		ScoreSummary:              "score 93",
		LearnerFeedback: domain.QuestionBankDraftAnswerLearnerFeedback{
			Summary:             "Your comparison is close; focus on matching denominators before judging size.",
			Encouragement:       "You identified the key numbers and can fix the reasoning with one more step.",
			NextSteps:           []string{"Rewrite both fractions with a common denominator.", "Compare the numerators only after denominators match."},
			MisconceptionTags:   []string{"denominator-mismatch"},
			PracticeSuggestions: []string{"Try two more fraction comparison items with unlike denominators."},
		},
		SafeLearnerFeedbackOnly: true,
		ReviewedAt:              time.Date(2026, 6, 6, 10, 20, 0, 0, time.UTC),
		ArchivedAt:              time.Date(2026, 6, 6, 10, 30, 0, 0, time.UTC),
		UpdatedAt:               time.Date(2026, 6, 6, 10, 31, 0, 0, time.UTC),
	}
}
