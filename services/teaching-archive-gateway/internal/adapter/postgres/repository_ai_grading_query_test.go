package postgres_test

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestListAIGradingRequestsBuildsScopedIndexedQuery(t *testing.T) {
	db := &recordingDB{rows: &singleAIGradingRequestRow{}}
	repository := postgres.NewArchiveRepository(db)

	requests, err := repository.ListAIGradingRequests(context.Background(), domain.AIGradingRequestQuery{
		Status:                 domain.AIGradingStatusQueued,
		ArchiveItemID:          "tarch_001",
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		StudentID:              "student_001",
		FetchLimit:             3,
		Cursor: &domain.AIGradingRequestCursor{
			CreatedAt: time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC),
			ID:        "grading_req_cursor",
		},
	})
	if err != nil {
		t.Fatalf("ListAIGradingRequests returned error: %v", err)
	}

	for _, fragment := range []string{
		"FROM teaching_ai_grading_requests",
		"status = $1",
		"archive_item_id = $2",
		"source_archive_owner_type = $3",
		"source_archive_student_id = $4",
		"(created_at, id) < ($5, $6)",
		"ORDER BY created_at DESC, id DESC",
		"LIMIT $7",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 7 {
		t.Fatalf("args = %d, want 7", len(db.args))
	}
	if len(requests) != 1 || requests[0].ID != "grading_req_row" {
		t.Fatalf("requests = %#v", requests)
	}
	if requests[0].SourceArchiveContentRef != "local://archive/student/quiz.pdf" {
		t.Fatalf("SourceArchiveContentRef = %q", requests[0].SourceArchiveContentRef)
	}
	if requests[0].SourceQuizSubmissionID != "quiz_sub_row" {
		t.Fatalf("SourceQuizSubmissionID = %q", requests[0].SourceQuizSubmissionID)
	}
	if requests[0].SourceAnswerRef != "local://answers/student_001/week-3.json" {
		t.Fatalf("SourceAnswerRef = %q", requests[0].SourceAnswerRef)
	}
	if requests[0].SourceQuestionBankDraftRef != "local://question-bank-drafts/tutor_req_row.json" {
		t.Fatalf("SourceQuestionBankDraftRef = %q", requests[0].SourceQuestionBankDraftRef)
	}
	if requests[0].SourceQuestionBankAnswerSubmissionID != "qbank_ans_sub_row" {
		t.Fatalf("SourceQuestionBankAnswerSubmissionID = %q", requests[0].SourceQuestionBankAnswerSubmissionID)
	}
}

func TestEnsureSchemaCreatesQuestionBankDraftAnswerScoringLookupIndex(t *testing.T) {
	db := &recordingDB{}

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema returned error: %v", err)
	}

	statements := strings.Join(db.execStatements, "\n")
	for _, fragment := range []string{
		"idx_teaching_ai_grading_requests_qbank_answer_student_created",
		"source_question_bank_answer_submission_id, source_archive_student_id, created_at DESC, id DESC",
		"WHERE source_question_bank_answer_submission_id IS NOT NULL",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("schema missing %q in: %s", fragment, statements)
		}
	}
}

func TestGetLatestQuestionBankDraftAnswerScoringRequestForStudentUsesScopedLookup(t *testing.T) {
	db := &recordingDB{rows: &singleAIGradingRequestRow{}}
	repository := postgres.NewArchiveRepository(db)

	request, ok, err := repository.GetLatestQuestionBankDraftAnswerScoringRequestForStudent(
		context.Background(),
		"qbank_ans_sub_row",
		"student_001",
	)
	if err != nil {
		t.Fatalf("GetLatestQuestionBankDraftAnswerScoringRequestForStudent returned error: %v", err)
	}
	if !ok {
		t.Fatalf("expected scoring request")
	}
	for _, fragment := range []string{
		"FROM teaching_ai_grading_requests",
		"source_question_bank_answer_submission_id = $1",
		"source_archive_student_id = $2",
		"source_question_bank_draft_ref IS NOT NULL",
		"ORDER BY created_at DESC, id DESC",
		"LIMIT 1",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 2 || db.args[0] != "qbank_ans_sub_row" || db.args[1] != "student_001" {
		t.Fatalf("args = %#v", db.args)
	}
	if request.SourceQuestionBankAnswerSubmissionID != "qbank_ans_sub_row" ||
		request.SourceArchiveStudentID != "student_001" {
		t.Fatalf("request = %#v", request)
	}
}

type singleAIGradingRequestRow struct {
	advanced            bool
	status              domain.AIGradingStatus
	claimedByWorkerID   string
	claimExpiresAt      time.Time
	claimExpiresAtValid bool
}

func (r *singleAIGradingRequestRow) Close() {}

func (r *singleAIGradingRequestRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleAIGradingRequestRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = "grading_req_row"
	*(dest[1].(*string)) = "tarch_001"
	*(dest[2].(*string)) = "teacher_001"
	*(dest[3].(*string)) = "grade short answers"
	*(dest[4].(*sql.NullString)) = sql.NullString{String: "local://rubrics/week-3.json", Valid: true}
	status := r.status
	if status == "" {
		status = domain.AIGradingStatusQueued
	}
	*(dest[5].(*string)) = string(status)
	*(dest[6].(*string)) = string(domain.OwnerTypeStudent)
	*(dest[7].(*sql.NullString)) = sql.NullString{String: "student_001", Valid: true}
	*(dest[8].(*string)) = "local://archive/student/quiz.pdf"
	*(dest[9].(*sql.NullString)) = sql.NullString{String: "quiz_sub_row", Valid: true}
	*(dest[10].(*sql.NullString)) = sql.NullString{String: "local://answers/student_001/week-3.json", Valid: true}
	*(dest[11].(*sql.NullString)) = sql.NullString{String: "local://question-bank-drafts/tutor_req_row.json", Valid: true}
	*(dest[12].(*sql.NullString)) = sql.NullString{String: "qbank_ans_sub_row", Valid: true}
	*(dest[13].(*string)) = string(domain.MaterialTypeQuiz)
	*(dest[14].(*string)) = string(domain.OCRStatusReserved)
	*(dest[15].(*sql.NullString)) = sql.NullString{}
	*(dest[16].(*sql.NullString)) = sql.NullString{}
	*(dest[17].(*sql.NullString)) = sql.NullString{}
	*(dest[18].(*sql.NullString)) = sql.NullString{}
	*(dest[19].(*sql.NullString)) = sql.NullString{String: r.claimedByWorkerID, Valid: r.claimedByWorkerID != ""}
	*(dest[20].(*sql.NullTime)) = sql.NullTime{Time: r.claimExpiresAt, Valid: r.claimExpiresAtValid}
	*(dest[21].(*time.Time)) = time.Date(2026, 5, 29, 10, 1, 0, 0, time.UTC)
	*(dest[22].(*sql.NullTime)) = sql.NullTime{}
	*(dest[23].(*time.Time)) = time.Date(2026, 5, 29, 10, 1, 0, 0, time.UTC)
	return nil
}

func (r *singleAIGradingRequestRow) Err() error {
	return nil
}
