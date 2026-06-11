package postgres_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
)

func TestEnsureSchemaCreatesQuestionBankDraftAnswerFeedbackArchiveSnapshotTable(t *testing.T) {
	db := &recordingDB{}

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema returned error: %v", err)
	}

	statements := strings.Join(db.execStatements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_answer_feedback_archive_snapshots",
		"feedback_archive_item_id TEXT PRIMARY KEY REFERENCES teaching_archive_items(id)",
		"submission_id TEXT NOT NULL REFERENCES teaching_question_bank_draft_answer_submissions(id)",
		"request_id TEXT NOT NULL REFERENCES teaching_ai_grading_requests(id)",
		"learner_feedback JSONB NOT NULL",
		"safe_learner_feedback_only BOOLEAN NOT NULL",
		"idx_teaching_qbank_answer_feedback_snapshots_student_latest",
		"idx_teaching_qbank_answer_feedback_snapshots_lineage",
		"WHERE safe_learner_feedback_only = TRUE",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("schema missing %q in: %s", fragment, statements)
		}
	}
}

func TestGetLatestQuestionBankDraftAnswerFeedbackArchiveSnapshotForStudentReadsSafeProjectionOnly(t *testing.T) {
	db := &recordingDB{rows: &singleQuestionBankDraftAnswerFeedbackArchiveSnapshotRow{}}
	repository := postgres.NewArchiveRepository(db)

	snapshot, ok, err := repository.GetLatestQuestionBankDraftAnswerFeedbackArchiveSnapshotForStudent(
		context.Background(),
		"qbank_ans_sub_001",
		"student_001",
	)
	if err != nil {
		t.Fatalf("GetLatestQuestionBankDraftAnswerFeedbackArchiveSnapshotForStudent returned error: %v", err)
	}
	if !ok ||
		snapshot.FeedbackArchiveItemID != "tarch_student_feedback_001" ||
		snapshot.SubmissionID != "qbank_ans_sub_001" ||
		snapshot.RequestID != "grading_req_qbank_answer_feedback_001" ||
		snapshot.SourceArchiveItemID != "tarch_source_homework_001" ||
		snapshot.LearnerFeedback.Summary == "" ||
		!snapshot.SafeLearnerFeedbackOnly {
		t.Fatalf("snapshot = %#v, ok=%v", snapshot, ok)
	}
	for _, fragment := range []string{
		"FROM teaching_question_bank_draft_answer_feedback_archive_snapshots AS snapshot",
		"snapshot.submission_id = $1",
		"snapshot.student_id = $2",
		"snapshot.learner_feedback",
		"snapshot.safe_learner_feedback_only = TRUE",
		"ORDER BY snapshot.archived_at DESC, snapshot.feedback_archive_item_id DESC",
		"LIMIT 1",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	for _, forbidden := range []string{
		"SELECT *",
		"answers",
		"answer_text",
		"answerText",
		"expected_answer",
		"expectedAnswer",
		"explanation",
		"result_ref",
		"content_ref",
		"raw_model_output",
		"worker_id",
	} {
		if strings.Contains(db.lastSQL, forbidden) {
			t.Fatalf("snapshot SQL leaked forbidden fragment %q in: %s", forbidden, db.lastSQL)
		}
	}
	if len(db.args) != 2 || db.args[0] != "qbank_ans_sub_001" || db.args[1] != "student_001" {
		t.Fatalf("args = %#v", db.args)
	}
}

type singleQuestionBankDraftAnswerFeedbackArchiveSnapshotRow struct {
	advanced bool
}

func (r *singleQuestionBankDraftAnswerFeedbackArchiveSnapshotRow) Close() {}

func (r *singleQuestionBankDraftAnswerFeedbackArchiveSnapshotRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleQuestionBankDraftAnswerFeedbackArchiveSnapshotRow) Scan(dest ...any) error {
	reviewedAt := time.Date(2026, 6, 6, 10, 20, 0, 0, time.UTC)
	archivedAt := time.Date(2026, 6, 6, 10, 30, 0, 0, time.UTC)
	updatedAt := time.Date(2026, 6, 6, 10, 31, 0, 0, time.UTC)
	*(dest[0].(*string)) = "tarch_student_feedback_001"
	*(dest[1].(*string)) = "qbank_ans_sub_001"
	*(dest[2].(*string)) = "student_001"
	*(dest[3].(*string)) = "grading_req_qbank_answer_feedback_001"
	*(dest[4].(*string)) = "local://question-bank-drafts/tutor_req_feedback_001.json"
	*(dest[5].(*string)) = "tutor_req_feedback_001"
	*(dest[6].(*string)) = "tarch_source_homework_001"
	*(dest[7].(*string)) = "score 93"
	*(dest[8].(*[]byte)) = []byte(`{"summary":"Your comparison is close; focus on matching denominators before judging size.","encouragement":"You identified the key numbers and can fix the reasoning with one more step.","nextSteps":["Rewrite both fractions with a common denominator.","Compare the numerators only after denominators match."],"misconceptionTags":["denominator-mismatch"],"practiceSuggestions":["Try two more fraction comparison items with unlike denominators."]}`)
	*(dest[9].(*bool)) = true
	*(dest[10].(*time.Time)) = reviewedAt
	*(dest[11].(*time.Time)) = archivedAt
	*(dest[12].(*time.Time)) = updatedAt
	return nil
}

func (r *singleQuestionBankDraftAnswerFeedbackArchiveSnapshotRow) Err() error {
	return nil
}
