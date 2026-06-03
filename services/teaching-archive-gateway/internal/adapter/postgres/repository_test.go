package postgres_test

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
)

func TestEnsureSchemaDropsRedundantArchiveItemWriteIndexes(t *testing.T) {
	db := &recordingDB{}

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema returned error: %v", err)
	}

	statements := strings.Join(db.execStatements, "\n")
	for _, indexName := range []string{
		"idx_teaching_archive_items_student_created",
		"idx_teaching_archive_items_owner_created",
		"idx_teaching_archive_items_material_created",
	} {
		if !strings.Contains(statements, "DROP INDEX IF EXISTS "+indexName) {
			t.Fatalf("schema does not drop redundant index %s", indexName)
		}
		if strings.Contains(statements, "CREATE INDEX IF NOT EXISTS "+indexName) {
			t.Fatalf("schema recreates redundant write-amplifying index %s", indexName)
		}
	}
	for _, indexName := range []string{
		"idx_teaching_archive_items_created_page",
		"idx_teaching_archive_items_student_page",
		"idx_teaching_archive_items_owner_page",
		"idx_teaching_archive_items_material_page",
	} {
		if !strings.Contains(statements, "CREATE INDEX IF NOT EXISTS "+indexName) {
			t.Fatalf("schema missing covered page index %s", indexName)
		}
	}
}

func TestEnsureSchemaUsesTransactionAdvisoryLockAroundStatements(t *testing.T) {
	db := &recordingDB{}

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema returned error: %v", err)
	}

	if len(db.execStatements) < 3 {
		t.Fatalf("execStatements = %d, want lock and schema", len(db.execStatements))
	}
	if db.beginCount != 1 {
		t.Fatalf("beginCount = %d, want 1", db.beginCount)
	}
	if !strings.Contains(db.execStatements[0], "pg_advisory_xact_lock") {
		t.Fatalf("first schema statement = %q, want transaction advisory lock", db.execStatements[0])
	}
	if db.commitCount != 1 {
		t.Fatalf("commitCount = %d, want 1", db.commitCount)
	}
	if db.rollbackCount != 0 {
		t.Fatalf("rollbackCount = %d, want 0", db.rollbackCount)
	}
}

func TestEnsureSchemaSkipsMigrationWhenCurrentVersionExists(t *testing.T) {
	db := &recordingDB{rows: &singleStringRow{value: "2026-06-03.schema.1"}}

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema returned error: %v", err)
	}

	statements := strings.Join(db.execStatements, "\n")
	if strings.Contains(statements, "CREATE TABLE IF NOT EXISTS teaching_archive_items") {
		t.Fatalf("schema should skip archive table migration when current version exists")
	}
	if db.commitCount != 1 {
		t.Fatalf("commitCount = %d, want 1", db.commitCount)
	}
}

func TestEnsureSchemaRollsBackAfterStatementFailure(t *testing.T) {
	schemaErr := errors.New("schema statement failed")
	db := &recordingDB{
		execErrors: map[string]error{
			"CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_created_page": schemaErr,
		},
	}

	err := postgres.EnsureSchema(context.Background(), db)
	if !errors.Is(err, schemaErr) {
		t.Fatalf("EnsureSchema error = %v, want schema error", err)
	}
	if db.commitCount != 0 {
		t.Fatalf("commitCount = %d, want 0", db.commitCount)
	}
	if db.rollbackCount != 1 {
		t.Fatalf("rollbackCount = %d, want 1", db.rollbackCount)
	}
}

func TestCreateArchiveItemRecordsDatabaseInsertTiming(t *testing.T) {
	db := &recordingDB{}
	repository := postgres.NewArchiveRepository(db)
	timing := &platform.TeachingArchiveTiming{}
	ctx := platform.WithTeachingArchiveTiming(context.Background(), timing)

	err := repository.Create(ctx, domain.ArchiveItem{
		ID:              "tarch_timing",
		OwnerType:       domain.OwnerTypeTeaching,
		MaterialType:    domain.MaterialTypeQuiz,
		Title:           "Week 3 Quiz",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://archive/quiz.json",
		Tags:            []string{"performance"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentAIGrading},
		OCRStatus:       domain.OCRStatusReserved,
		CreatedAt:       time.Date(2026, 6, 3, 10, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if timing.DBInsert <= 0 {
		t.Fatalf("DBInsert timing = %s, want positive duration", timing.DBInsert)
	}
	if !strings.Contains(db.lastExecSQL, "INSERT INTO teaching_archive_items") {
		t.Fatalf("lastExecSQL = %s", db.lastExecSQL)
	}
}

func TestListTutoringAnalysisRequestsBuildsScopedIndexedQuery(t *testing.T) {
	db := &recordingDB{rows: &singleTutoringAnalysisRequestRow{}}
	repository := postgres.NewArchiveRepository(db)

	requests, err := repository.ListTutoringAnalysisRequests(context.Background(), domain.TutoringAnalysisRequestQuery{
		Status:                 domain.TutoringAnalysisStatusQueued,
		ArchiveItemID:          "tarch_001",
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		StudentID:              "student_001",
		RequestedByPrincipalID: "teacher_001",
		FetchLimit:             3,
		Cursor: &domain.TutoringAnalysisRequestCursor{
			CreatedAt: time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC),
			ID:        "tutor_req_cursor",
		},
	})
	if err != nil {
		t.Fatalf("ListTutoringAnalysisRequests returned error: %v", err)
	}

	for _, fragment := range []string{
		"status = $1",
		"archive_item_id = $2",
		"requested_by_principal_id = $3",
		"source_archive_owner_type = $4",
		"source_archive_student_id = $5",
		"(created_at, id) < ($6, $7)",
		"ORDER BY created_at DESC, id DESC",
		"LIMIT $8",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 8 {
		t.Fatalf("args = %d, want 8", len(db.args))
	}
	if len(requests) != 1 || requests[0].ID != "tutor_req_row" {
		t.Fatalf("requests = %#v", requests)
	}
}

func TestListTutoringAnalysisRequestsBuildsQuestionBankDraftPredicate(t *testing.T) {
	db := &recordingDB{rows: &singleTutoringAnalysisRequestRow{}}
	repository := postgres.NewArchiveRepository(db)

	_, err := repository.ListTutoringAnalysisRequests(context.Background(), domain.TutoringAnalysisRequestQuery{
		Status:                      domain.TutoringAnalysisStatusSucceeded,
		SourceArchiveOwnerType:      domain.OwnerTypeStudent,
		StudentID:                   "student_001",
		RequireQuestionBankDraftRef: true,
		FetchLimit:                  3,
	})
	if err != nil {
		t.Fatalf("ListTutoringAnalysisRequests returned error: %v", err)
	}

	for _, fragment := range []string{
		"status = $1",
		"source_archive_owner_type = $2",
		"source_archive_student_id = $3",
		"question_bank_draft_ref IS NOT NULL",
		"LIMIT $4",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
}

func TestRecordTutoringAnalysisResultUpdatesMetadataOnly(t *testing.T) {
	db := &recordingDB{tag: commandTag{rowsAffected: 1}}
	repository := postgres.NewArchiveRepository(db)

	err := repository.RecordTutoringAnalysisResult(context.Background(), domain.TutoringAnalysisRequest{
		ID:                   "tutor_req_row",
		Status:               domain.TutoringAnalysisStatusSucceeded,
		ResultSummary:        "mastered fractions",
		ResultRef:            "local://analysis/tutor_req_row/result.json",
		QuestionBankDraftRef: "local://question-bank-drafts/tutor_req_row.json",
		ClaimedByWorkerID:    "worker_teaching_ai_01",
		ClaimExpiresAt:       time.Date(2026, 5, 29, 11, 5, 0, 0, time.UTC),
		CompletedAt:          time.Date(2026, 5, 29, 11, 0, 0, 0, time.UTC),
		UpdatedAt:            time.Date(2026, 5, 29, 11, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("RecordTutoringAnalysisResult returned error: %v", err)
	}

	for _, fragment := range []string{
		"UPDATE teaching_tutoring_analysis_requests",
		"status = $1",
		"result_summary = NULLIF($2, '')",
		"result_ref = NULLIF($3, '')",
		"question_bank_draft_ref = NULLIF($4, '')",
		"completed_at = $7",
		"updated_at = $8",
		"WHERE id = $9",
		"status = $10",
		"claimed_by_worker_id = $11",
		"claim_expires_at > $12",
	} {
		if !strings.Contains(db.lastExecSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastExecSQL)
		}
	}
	if len(db.execArgs) != 12 {
		t.Fatalf("args = %d, want 12", len(db.execArgs))
	}
}

func TestRecordTutoringAnalysisResultRejectsAtomicFinalOverwrite(t *testing.T) {
	db := &recordingDB{tag: commandTag{rowsAffected: 0}}
	repository := postgres.NewArchiveRepository(db)

	err := repository.RecordTutoringAnalysisResult(context.Background(), domain.TutoringAnalysisRequest{
		ID:           "tutor_req_row",
		Status:       domain.TutoringAnalysisStatusFailed,
		ErrorMessage: "worker failed",
		CompletedAt:  time.Date(2026, 5, 29, 11, 0, 0, 0, time.UTC),
		UpdatedAt:    time.Date(2026, 5, 29, 11, 0, 0, 0, time.UTC),
	})
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
}

func TestClaimNextTutoringAnalysisRequestUsesAtomicSkipLockedUpdate(t *testing.T) {
	db := &recordingDB{rows: &singleTutoringAnalysisRequestRow{
		status:              domain.TutoringAnalysisStatusInProgress,
		claimedByWorkerID:   "worker_teaching_ai_01",
		claimExpiresAt:      time.Date(2026, 5, 29, 16, 5, 0, 0, time.UTC),
		claimExpiresAtValid: true,
	}}
	repository := postgres.NewArchiveRepository(db)

	request, ok, err := repository.ClaimNextTutoringAnalysisRequest(
		context.Background(),
		domain.ClaimTutoringAnalysisRequestInput{
			WorkerID:     "worker_teaching_ai_01",
			LeaseSeconds: 300,
		},
		time.Date(2026, 5, 29, 16, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("ClaimNextTutoringAnalysisRequest returned error: %v", err)
	}
	if !ok {
		t.Fatalf("expected a claimed request")
	}
	if request.Status != domain.TutoringAnalysisStatusInProgress {
		t.Fatalf("Status = %q", request.Status)
	}

	for _, fragment := range []string{
		"UPDATE teaching_tutoring_analysis_requests",
		"status = $1",
		"claimed_by_worker_id = $2",
		"claim_expires_at = $3",
		"WHERE status = $5",
		"OR (status = $6 AND claim_expires_at <= $4)",
		"ORDER BY created_at ASC, id ASC",
		"FOR UPDATE SKIP LOCKED",
		"RETURNING",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 6 {
		t.Fatalf("args = %d, want 6", len(db.args))
	}
}

func TestCreateAIGradingRequestInsertsMetadataOnly(t *testing.T) {
	db := &recordingDB{tag: commandTag{rowsAffected: 1}}
	repository := postgres.NewArchiveRepository(db)

	err := repository.CreateAIGradingRequest(context.Background(), domain.AIGradingRequest{
		ID:                      "grading_req_row",
		ArchiveItemID:           "tarch_row",
		RequestedByPrincipalID:  "student_001",
		GradingInstructions:     "grade short answers",
		RubricRef:               "local://rubrics/week-3.json",
		Status:                  domain.AIGradingStatusQueued,
		SourceArchiveOwnerType:  domain.OwnerTypeStudent,
		SourceArchiveStudentID:  "student_001",
		SourceArchiveContentRef: "local://archive/student/quiz.pdf",
		SourceQuizSubmissionID:  "quiz_sub_row",
		SourceAnswerRef:         "local://answers/student_001/week-3.json",
		SourceArchiveMaterial:   domain.MaterialTypeQuiz,
		SourceArchiveOCRStatus:  domain.OCRStatusReserved,
		CreatedAt:               time.Date(2026, 5, 29, 17, 0, 0, 0, time.UTC),
		UpdatedAt:               time.Date(2026, 5, 29, 17, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("CreateAIGradingRequest returned error: %v", err)
	}

	for _, fragment := range []string{
		"INSERT INTO teaching_ai_grading_requests",
		"archive_item_id",
		"grading_instructions",
		"rubric_ref",
		"source_archive_content_ref",
		"source_quiz_submission_id",
		"source_answer_ref",
		"source_archive_ocr_status",
		"VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7, NULLIF($8, ''), $9, NULLIF($10, ''), NULLIF($11, ''), $12, $13, $14, $15)",
	} {
		if !strings.Contains(db.lastExecSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastExecSQL)
		}
	}
	if len(db.execArgs) != 15 {
		t.Fatalf("args = %d, want 15", len(db.execArgs))
	}
}

func TestRecordAIGradingResultUpdatesMetadataOnly(t *testing.T) {
	db := &recordingDB{tag: commandTag{rowsAffected: 1}}
	repository := postgres.NewArchiveRepository(db)

	err := repository.RecordAIGradingResult(context.Background(), domain.AIGradingRequest{
		ID:                "grading_req_row",
		Status:            domain.AIGradingStatusSucceeded,
		ScoreSummary:      "score 93",
		ResultRef:         "local://grading/grading_req_row/result.json",
		ClaimedByWorkerID: "worker_ai_grading_01",
		ClaimExpiresAt:    time.Date(2026, 5, 30, 9, 5, 0, 0, time.UTC),
		CompletedAt:       time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC),
		UpdatedAt:         time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("RecordAIGradingResult returned error: %v", err)
	}

	for _, fragment := range []string{
		"UPDATE teaching_ai_grading_requests",
		"status = $1",
		"score_summary = NULLIF($2, '')",
		"result_ref = NULLIF($3, '')",
		"completed_at = $6",
		"updated_at = $7",
		"WHERE id = $8",
		"status = $9",
		"claimed_by_worker_id = $10",
		"claim_expires_at > $11",
	} {
		if !strings.Contains(db.lastExecSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastExecSQL)
		}
	}
	if len(db.execArgs) != 11 {
		t.Fatalf("args = %d, want 11", len(db.execArgs))
	}
}

func TestRecordAIGradingResultRejectsAtomicFinalOverwrite(t *testing.T) {
	db := &recordingDB{tag: commandTag{rowsAffected: 0}}
	repository := postgres.NewArchiveRepository(db)

	err := repository.RecordAIGradingResult(context.Background(), domain.AIGradingRequest{
		ID:           "grading_req_row",
		Status:       domain.AIGradingStatusFailed,
		ErrorMessage: "worker failed",
		CompletedAt:  time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC),
		UpdatedAt:    time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC),
	})
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
}

type recordingDB struct {
	lastSQL        string
	lastExecSQL    string
	args           []any
	execArgs       []any
	execStatements []string
	execErrors     map[string]error
	rows           postgres.Rows
	tag            postgres.CommandTag
	beginCount     int
	commitCount    int
	rollbackCount  int
}

func (db *recordingDB) Begin(_ context.Context) (postgres.Tx, error) {
	db.beginCount += 1
	return db, nil
}

func (db *recordingDB) Commit(_ context.Context) error {
	db.commitCount += 1
	return nil
}

func (db *recordingDB) Rollback(_ context.Context) error {
	db.rollbackCount += 1
	return nil
}

func (db *recordingDB) Exec(_ context.Context, statement string, args ...any) (postgres.CommandTag, error) {
	db.lastExecSQL = statement
	db.execStatements = append(db.execStatements, statement)
	db.execArgs = append([]any(nil), args...)
	for fragment, err := range db.execErrors {
		if strings.Contains(statement, fragment) {
			return nil, err
		}
	}
	if db.tag == nil {
		return commandTag{rowsAffected: 1}, nil
	}
	return db.tag, nil
}

func (db *recordingDB) Query(_ context.Context, query string, args ...any) (postgres.Rows, error) {
	db.lastSQL = query
	db.args = append([]any(nil), args...)
	if db.rows == nil {
		return &emptyRows{}, nil
	}
	return db.rows, nil
}

type singleStringRow struct {
	value    string
	advanced bool
}

func (r *singleStringRow) Close() {}

func (r *singleStringRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleStringRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = r.value
	return nil
}

func (r *singleStringRow) Err() error {
	return nil
}

type singleTutoringAnalysisRequestRow struct {
	advanced            bool
	status              domain.TutoringAnalysisStatus
	claimedByWorkerID   string
	claimExpiresAt      time.Time
	claimExpiresAtValid bool
}

func (r *singleTutoringAnalysisRequestRow) Close() {}

func (r *singleTutoringAnalysisRequestRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleTutoringAnalysisRequestRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = "tutor_req_row"
	*(dest[1].(*string)) = "tarch_001"
	*(dest[2].(*string)) = "teacher_001"
	*(dest[3].(*string)) = "find weak skills"
	*(dest[4].(*string)) = string(domain.QuestionBankIntentGeneratePersonalizedCheck)
	status := r.status
	if status == "" {
		status = domain.TutoringAnalysisStatusQueued
	}
	*(dest[5].(*string)) = string(status)
	*(dest[6].(*string)) = string(domain.OwnerTypeStudent)
	*(dest[7].(*sql.NullString)) = sql.NullString{String: "student_001", Valid: true}
	*(dest[8].(*string)) = string(domain.MaterialTypeQuiz)
	*(dest[9].(*sql.NullString)) = sql.NullString{}
	*(dest[10].(*sql.NullString)) = sql.NullString{}
	*(dest[11].(*sql.NullString)) = sql.NullString{}
	*(dest[12].(*sql.NullString)) = sql.NullString{}
	*(dest[13].(*sql.NullString)) = sql.NullString{}
	*(dest[14].(*sql.NullString)) = sql.NullString{String: r.claimedByWorkerID, Valid: r.claimedByWorkerID != ""}
	*(dest[15].(*sql.NullTime)) = sql.NullTime{Time: r.claimExpiresAt, Valid: r.claimExpiresAtValid}
	*(dest[16].(*time.Time)) = time.Date(2026, 5, 29, 10, 1, 0, 0, time.UTC)
	*(dest[17].(*sql.NullTime)) = sql.NullTime{}
	*(dest[18].(*sql.NullTime)) = sql.NullTime{}
	return nil
}

func (r *singleTutoringAnalysisRequestRow) Err() error {
	return nil
}

type commandTag struct {
	rowsAffected int64
}

func (tag commandTag) RowsAffected() int64 {
	return tag.rowsAffected
}
