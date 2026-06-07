package postgres_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestEnsureSchemaCreatesQuestionBankDraftContentTable(t *testing.T) {
	db := &recordingDB{}

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema returned error: %v", err)
	}

	statements := strings.Join(db.execStatements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_contents",
		"question_items JSONB NOT NULL",
		"REFERENCES teaching_tutoring_analysis_requests(id)",
		"idx_teaching_question_bank_draft_contents_student_updated",
		"idx_teaching_question_bank_draft_contents_request",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("schema missing %q in: %s", fragment, statements)
		}
	}
}

func TestSaveQuestionBankDraftContentUpsertsValidatedJSON(t *testing.T) {
	db := &recordingDB{}
	repository := postgres.NewArchiveRepository(db)

	err := repository.SaveQuestionBankDraftContent(context.Background(), questionBankDraftContentFixture())
	if err != nil {
		t.Fatalf("SaveQuestionBankDraftContent returned error: %v", err)
	}

	for _, fragment := range []string{
		"INSERT INTO teaching_question_bank_draft_contents",
		"question_items",
		"$8::jsonb",
		"ON CONFLICT (question_bank_draft_ref) DO UPDATE",
		"updated_at = EXCLUDED.updated_at",
	} {
		if !strings.Contains(db.lastExecSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastExecSQL)
		}
	}
	if len(db.execArgs) != 10 {
		t.Fatalf("args = %d, want 10", len(db.execArgs))
	}
	if db.execArgs[0] != "local://question-bank-drafts/tutor_req_001.json" ||
		db.execArgs[3] != "student_001" ||
		db.execArgs[4] != domain.QuestionBankDraftContentStatusDraft {
		t.Fatalf("unexpected args: %#v", db.execArgs)
	}
	if !strings.Contains(string(db.execArgs[7].([]byte)), `"questionText":"What is 1/2 + 1/4?"`) {
		t.Fatalf("question JSON = %s", db.execArgs[7])
	}
}

func TestGetQuestionBankDraftContentForStudentUsesScopedLookup(t *testing.T) {
	db := &recordingDB{rows: &singleQuestionBankDraftContentRow{}}
	repository := postgres.NewArchiveRepository(db)

	content, ok, err := repository.GetQuestionBankDraftContentForStudent(
		context.Background(),
		"local://question-bank-drafts/tutor_req_001.json",
		"student_001",
	)
	if err != nil {
		t.Fatalf("GetQuestionBankDraftContentForStudent returned error: %v", err)
	}
	if !ok {
		t.Fatalf("expected content")
	}
	if content.StudentID != "student_001" || len(content.Items) != 1 {
		t.Fatalf("content = %#v", content)
	}
	for _, fragment := range []string{
		"FROM teaching_question_bank_draft_contents",
		"question_bank_draft_ref = $1",
		"student_id = $2",
		"LIMIT 1",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
}

type singleQuestionBankDraftContentRow struct {
	advanced bool
}

func (r *singleQuestionBankDraftContentRow) Close() {}

func (r *singleQuestionBankDraftContentRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleQuestionBankDraftContentRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = "local://question-bank-drafts/tutor_req_001.json"
	*(dest[1].(*string)) = "tutor_req_001"
	*(dest[2].(*string)) = "tarch_001"
	*(dest[3].(*string)) = "student_001"
	*(dest[4].(*string)) = string(domain.QuestionBankDraftContentStatusDraft)
	*(dest[5].(*string)) = string(domain.MaterialTypeQuiz)
	*(dest[6].(*string)) = "fractions need targeted practice"
	*(dest[7].(*[]byte)) = []byte(`[{"id":"q_001","questionText":"What is 1/2 + 1/4?","expectedAnswer":"3/4","explanation":"Use a common denominator of 4.","learningTarget":"fraction addition"}]`)
	*(dest[8].(*time.Time)) = time.Date(2026, 6, 6, 9, 0, 0, 0, time.UTC)
	*(dest[9].(*time.Time)) = time.Date(2026, 6, 6, 9, 5, 0, 0, time.UTC)
	return nil
}

func (r *singleQuestionBankDraftContentRow) Err() error {
	return nil
}

func questionBankDraftContentFixture() domain.QuestionBankDraftContent {
	createdAt := time.Date(2026, 6, 6, 9, 0, 0, 0, time.UTC)
	return domain.QuestionBankDraftContent{
		QuestionBankDraftRef:      "local://question-bank-drafts/tutor_req_001.json",
		TutoringAnalysisRequestID: "tutor_req_001",
		ArchiveItemID:             "tarch_001",
		StudentID:                 "student_001",
		Status:                    domain.QuestionBankDraftContentStatusDraft,
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
