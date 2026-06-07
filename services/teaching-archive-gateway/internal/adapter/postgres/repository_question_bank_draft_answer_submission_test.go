package postgres_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestEnsureSchemaCreatesQuestionBankDraftAnswerSubmissionTable(t *testing.T) {
	db := &recordingDB{}

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema returned error: %v", err)
	}

	statements := strings.Join(db.execStatements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_answer_submissions",
		"question_bank_draft_ref TEXT NOT NULL REFERENCES teaching_question_bank_draft_contents",
		"answers JSONB NOT NULL",
		"idx_teaching_question_bank_draft_answer_submissions_student_submitted",
		"idx_teaching_question_bank_draft_answer_submissions_draft_submitted",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("schema missing %q in: %s", fragment, statements)
		}
	}
}

func TestSubmitQuestionBankDraftAnswerSubmissionInsertsAnswerJSON(t *testing.T) {
	db := &recordingDB{tag: commandTag{rowsAffected: 1}}
	repository := postgres.NewArchiveRepository(db)
	timing := &platform.TeachingArchiveTiming{}
	ctx := platform.WithTeachingArchiveTiming(context.Background(), timing)

	outcome, err := repository.SubmitQuestionBankDraftAnswerSubmission(
		ctx,
		domain.QuestionBankDraftAnswerSubmission{
			ID:                        "qbank_ans_sub_row",
			QuestionBankDraftRef:      "local://question-bank-drafts/tutor_req_001.json",
			TutoringAnalysisRequestID: "tutor_req_001",
			ArchiveItemID:             "tarch_001",
			StudentID:                 "student_001",
			SubmittedByPrincipalID:    "student_001",
			Status:                    domain.QuestionBankDraftAnswerSubmissionStatusSubmitted,
			Answers: []domain.QuestionBankDraftSubmittedAnswer{
				{ItemID: "q_001", AnswerText: "3/4"},
			},
			SubmittedAt: time.Date(2026, 6, 6, 9, 30, 0, 0, time.UTC),
		},
	)
	if err != nil {
		t.Fatalf("SubmitQuestionBankDraftAnswerSubmission returned error: %v", err)
	}
	if outcome.Status != usecase.PersistenceStatusPersisted {
		t.Fatalf("outcome = %#v", outcome)
	}
	for _, fragment := range []string{
		"INSERT INTO teaching_question_bank_draft_answer_submissions",
		"question_bank_draft_ref",
		"submitted_by_principal_id",
		"answers",
		"$8::jsonb",
	} {
		if !strings.Contains(db.lastExecSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastExecSQL)
		}
	}
	if len(db.execArgs) != 9 {
		t.Fatalf("args = %d, want 9", len(db.execArgs))
	}
	if db.execArgs[0] != "qbank_ans_sub_row" || db.execArgs[4] != "student_001" {
		t.Fatalf("unexpected args: %#v", db.execArgs)
	}
	if !strings.Contains(string(db.execArgs[7].([]byte)), `"answerText":"3/4"`) {
		t.Fatalf("answers JSON = %s", db.execArgs[7])
	}
	if timing.DBInsert <= 0 {
		t.Fatalf("DBInsert = %s, want > 0", timing.DBInsert)
	}
}

func TestGetQuestionBankDraftAnswerSubmissionForStudentUsesScopedLookup(t *testing.T) {
	db := &recordingDB{rows: &singleQuestionBankDraftAnswerSubmissionRow{}}
	repository := postgres.NewArchiveRepository(db)

	submission, ok, err := repository.GetQuestionBankDraftAnswerSubmissionForStudent(
		context.Background(),
		"qbank_ans_sub_row",
		"student_001",
	)
	if err != nil {
		t.Fatalf("GetQuestionBankDraftAnswerSubmissionForStudent returned error: %v", err)
	}
	if !ok {
		t.Fatalf("expected submission")
	}
	for _, fragment := range []string{
		"FROM teaching_question_bank_draft_answer_submissions",
		"id = $1",
		"student_id = $2",
		"LIMIT 1",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 2 || db.args[0] != "qbank_ans_sub_row" || db.args[1] != "student_001" {
		t.Fatalf("args = %#v", db.args)
	}
	if submission.ID != "qbank_ans_sub_row" || submission.StudentID != "student_001" {
		t.Fatalf("submission = %#v", submission)
	}
	if len(submission.Answers) != 1 || submission.Answers[0].AnswerText != "3/4" {
		t.Fatalf("answers = %#v", submission.Answers)
	}
}

type singleQuestionBankDraftAnswerSubmissionRow struct {
	advanced bool
}

func (r *singleQuestionBankDraftAnswerSubmissionRow) Close() {}

func (r *singleQuestionBankDraftAnswerSubmissionRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleQuestionBankDraftAnswerSubmissionRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = "qbank_ans_sub_row"
	*(dest[1].(*string)) = "local://question-bank-drafts/tutor_req_001.json"
	*(dest[2].(*string)) = "tutor_req_001"
	*(dest[3].(*string)) = "tarch_001"
	*(dest[4].(*string)) = "student_001"
	*(dest[5].(*string)) = "student_001"
	*(dest[6].(*string)) = string(domain.QuestionBankDraftAnswerSubmissionStatusSubmitted)
	*(dest[7].(*[]byte)) = []byte(`[{"itemId":"q_001","answerText":"3/4"}]`)
	*(dest[8].(*time.Time)) = time.Date(2026, 6, 6, 9, 30, 0, 0, time.UTC)
	return nil
}

func (r *singleQuestionBankDraftAnswerSubmissionRow) Err() error {
	return nil
}
