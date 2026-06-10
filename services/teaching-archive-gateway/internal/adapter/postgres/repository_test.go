package postgres_test

import (
	"context"
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
		"idx_teaching_archive_items_owner_material_page",
		"idx_teaching_archive_items_student_material_search_scope",
		"idx_teaching_archive_publications_student_app_visible_lookup",
		"idx_teaching_archive_publications_student_app_visible_page",
		"idx_teaching_archive_material_content_previews_student_updated",
	} {
		if !strings.Contains(statements, "CREATE INDEX IF NOT EXISTS "+indexName) {
			t.Fatalf("schema missing covered page index %s", indexName)
		}
	}
	if !strings.Contains(statements, "CREATE UNIQUE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_pending_result_archive_follow_up_unique") {
		t.Fatalf("schema missing pending result-archive follow-up unique index")
	}
	if !strings.Contains(statements, "WHERE source_type = 'AI_TUTOR_RESULT_ARCHIVE'") ||
		!strings.Contains(statements, "AND status IN ('QUEUED', 'IN_PROGRESS')") {
		t.Fatalf("schema missing pending result-archive follow-up partial unique predicate")
	}
	if !strings.Contains(statements, "CREATE TABLE IF NOT EXISTS teaching_archive_publications") {
		t.Fatalf("schema missing teaching archive publication projection table")
	}
	if !strings.Contains(statements, "CREATE TABLE IF NOT EXISTS teaching_archive_material_content_previews") {
		t.Fatalf("schema missing safe archive material content preview table")
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
	db := &recordingDB{rows: &singleStringRow{value: "2026-06-08.schema.7"}}

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema returned error: %v", err)
	}

	statements := strings.Join(db.execStatements, "\n")
	if strings.Contains(statements, "CREATE TABLE IF NOT EXISTS teaching_archive_items") {
		t.Fatalf("schema should skip archive table migration when current version exists")
	}
	if !strings.Contains(statements, "CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_created_page") {
		t.Fatalf("schema should still apply the selected index profile when current version exists")
	}
	if db.commitCount != 1 {
		t.Fatalf("commitCount = %d, want 1", db.commitCount)
	}
}

func TestEnsureSchemaWithHotWriteProfileDropsRedundantArchiveItemPageIndexes(t *testing.T) {
	db := &recordingDB{}

	err := postgres.EnsureSchemaWithOptions(context.Background(), db, postgres.SchemaOptions{
		IndexProfile: postgres.SchemaIndexProfileHotWrite,
	})
	if err != nil {
		t.Fatalf("EnsureSchemaWithOptions returned error: %v", err)
	}

	statements := strings.Join(db.execStatements, "\n")
	for _, indexName := range []string{
		"idx_teaching_archive_items_created_page",
		"idx_teaching_archive_items_owner_page",
		"idx_teaching_archive_items_material_page",
		"idx_teaching_archive_items_student_material_search_scope",
	} {
		if !strings.Contains(statements, "DROP INDEX IF EXISTS "+indexName) {
			t.Fatalf("hot_write profile should drop write-amplifying page index %s", indexName)
		}
	}
	for _, indexName := range []string{
		"idx_teaching_archive_items_student_page",
		"idx_teaching_archive_items_owner_material_page",
	} {
		if !strings.Contains(statements, "CREATE INDEX IF NOT EXISTS "+indexName) {
			t.Fatalf("hot_write profile should retain hot query index %s", indexName)
		}
	}
}

func TestEnsureSchemaWithFullProfileRestoresArchiveItemPageIndexes(t *testing.T) {
	db := &recordingDB{rows: &singleStringRow{value: "2026-06-08.schema.7"}}

	err := postgres.EnsureSchemaWithOptions(context.Background(), db, postgres.SchemaOptions{
		IndexProfile: postgres.SchemaIndexProfileFull,
	})
	if err != nil {
		t.Fatalf("EnsureSchemaWithOptions returned error: %v", err)
	}

	statements := strings.Join(db.execStatements, "\n")
	for _, indexName := range []string{
		"idx_teaching_archive_items_created_page",
		"idx_teaching_archive_items_owner_page",
		"idx_teaching_archive_items_material_page",
		"idx_teaching_archive_items_student_material_search_scope",
	} {
		if !strings.Contains(statements, "CREATE INDEX IF NOT EXISTS "+indexName) {
			t.Fatalf("full profile should restore archive item page index %s", indexName)
		}
	}
	if strings.Contains(statements, "CREATE TABLE IF NOT EXISTS teaching_archive_items") {
		t.Fatalf("full profile switch should not replay base migration when current version exists")
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

	_, err := repository.Create(ctx, domain.ArchiveItem{
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

func TestListArchiveItemsRecordsDatabaseQueryTiming(t *testing.T) {
	db := &recordingDB{}
	repository := postgres.NewArchiveRepository(db)
	timing := &platform.TeachingArchiveTiming{}
	ctx := platform.WithTeachingArchiveTiming(context.Background(), timing)

	_, err := repository.List(ctx, domain.ArchiveItemQuery{
		OwnerType:  domain.OwnerTypeStudent,
		StudentID:  "student_001",
		FetchLimit: 10,
	})
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	if timing.DBQuery <= 0 {
		t.Fatalf("DBQuery timing = %s, want positive duration", timing.DBQuery)
	}
	if !strings.Contains(db.lastSQL, "FROM teaching_archive_items") {
		t.Fatalf("lastSQL = %s", db.lastSQL)
	}
}

func TestBatchingArchiveItemRepositoryGroupsConcurrentCreatesIntoSingleInsert(t *testing.T) {
	db := &batchRecordingDB{}
	repository := postgres.NewBatchingArchiveItemRepository(db, postgres.ArchiveCreateBatchConfig{
		MaxSize:  3,
		MaxDelay: time.Second,
	})
	start := make(chan struct{})
	errs := make(chan error, 3)
	timings := make([]*platform.TeachingArchiveTiming, 3)

	for index := 0; index < 3; index++ {
		index := index
		timings[index] = &platform.TeachingArchiveTiming{}
		go func() {
			<-start
			ctx := platform.WithTeachingArchiveTiming(context.Background(), timings[index])
			_, err := repository.Create(ctx, testArchiveItem(index))
			errs <- err
		}()
	}
	close(start)

	for index := 0; index < 3; index++ {
		if err := <-errs; err != nil {
			t.Fatalf("Create returned error: %v", err)
		}
	}
	repository.Close()

	if db.acquireCount != 1 {
		t.Fatalf("Acquire count = %d want 1", db.acquireCount)
	}
	if db.releaseCount != 1 {
		t.Fatalf("Release count = %d want 1", db.releaseCount)
	}
	if len(db.statements) != 1 {
		t.Fatalf("statements = %d want 1", len(db.statements))
	}
	if got := strings.Count(db.statements[0], "::jsonb"); got != 6 {
		t.Fatalf("multi-row insert should contain 6 jsonb casts, got %d in:\n%s", got, db.statements[0])
	}
	if len(db.args) != 33 {
		t.Fatalf("args = %d want 33", len(db.args))
	}
	for index, timing := range timings {
		if timing.DBBatchWait <= 0 {
			t.Fatalf("timing[%d].DBBatchWait = %s want > 0", index, timing.DBBatchWait)
		}
		if timing.DBAcquire <= 0 {
			t.Fatalf("timing[%d].DBAcquire = %s want > 0", index, timing.DBAcquire)
		}
		if timing.DBExec <= 0 {
			t.Fatalf("timing[%d].DBExec = %s want > 0", index, timing.DBExec)
		}
		if timing.DBInsert <= 0 {
			t.Fatalf("timing[%d].DBInsert = %s want > 0", index, timing.DBInsert)
		}
	}
}

func TestBatchingArchiveItemRepositoryCopyModeUsesCopyFromForWholeBatch(t *testing.T) {
	db := &batchRecordingDB{}
	repository := postgres.NewBatchingArchiveItemRepository(db, postgres.ArchiveCreateBatchConfig{
		MaxSize:  3,
		MaxDelay: time.Second,
		Mode:     postgres.ArchiveCreateBatchModeCopy,
	})
	start := make(chan struct{})
	errs := make(chan error, 3)
	timings := make([]*platform.TeachingArchiveTiming, 3)

	for index := 0; index < 3; index++ {
		index := index
		timings[index] = &platform.TeachingArchiveTiming{}
		go func() {
			<-start
			ctx := platform.WithTeachingArchiveTiming(context.Background(), timings[index])
			_, err := repository.Create(ctx, testArchiveItem(index))
			errs <- err
		}()
	}
	close(start)

	for index := 0; index < 3; index++ {
		if err := <-errs; err != nil {
			t.Fatalf("Create returned error: %v", err)
		}
	}
	repository.Close()

	if db.acquireCount != 1 {
		t.Fatalf("Acquire count = %d want 1", db.acquireCount)
	}
	if db.releaseCount != 1 {
		t.Fatalf("Release count = %d want 1", db.releaseCount)
	}
	if db.copyCount != 1 {
		t.Fatalf("CopyFrom count = %d want 1", db.copyCount)
	}
	if len(db.statements) != 0 {
		t.Fatalf("Exec statements = %d want 0", len(db.statements))
	}
	if got := strings.Join(db.copyTable, "."); got != "teaching_archive_items" {
		t.Fatalf("copy table = %q want teaching_archive_items", got)
	}
	if strings.Join(db.copyColumns, ",") != "id,owner_type,student_id,material_type,title,source,content_ref,tags,analysis_intents,ocr_status,created_at" {
		t.Fatalf("copy columns = %#v", db.copyColumns)
	}
	if len(db.copyRows) != 3 {
		t.Fatalf("copy rows = %d want 3", len(db.copyRows))
	}
	copiedRow := findCopyRowByID(db.copyRows, "tarch_2")
	if copiedRow == nil {
		t.Fatalf("copy rows missing tarch_2: %#v", db.copyRows)
	}
	if copiedRow[2] != nil {
		t.Fatalf("student id = %#v want nil", copiedRow[2])
	}
	if got := copiedRow[7]; got != `["performance"]` {
		t.Fatalf("copied tags = %#v", got)
	}
	for index, timing := range timings {
		if timing.DBBatchWait <= 0 {
			t.Fatalf("timing[%d].DBBatchWait = %s want > 0", index, timing.DBBatchWait)
		}
		if timing.DBAcquire <= 0 {
			t.Fatalf("timing[%d].DBAcquire = %s want > 0", index, timing.DBAcquire)
		}
		if timing.DBExec <= 0 {
			t.Fatalf("timing[%d].DBExec = %s want > 0", index, timing.DBExec)
		}
		if timing.DBInsert <= 0 {
			t.Fatalf("timing[%d].DBInsert = %s want > 0", index, timing.DBInsert)
		}
	}
}

func TestBatchingArchiveItemRepositoryCopyModeReturnsCopyErrorToWholeBatch(t *testing.T) {
	copyErr := errors.New("archive copy failed")
	db := &batchRecordingDB{copyErr: copyErr}
	repository := postgres.NewBatchingArchiveItemRepository(db, postgres.ArchiveCreateBatchConfig{
		MaxSize:  2,
		MaxDelay: time.Second,
		Mode:     postgres.ArchiveCreateBatchModeCopy,
	})
	defer repository.Close()
	start := make(chan struct{})
	errs := make(chan error, 2)

	for index := 0; index < 2; index++ {
		index := index
		go func() {
			<-start
			_, err := repository.Create(context.Background(), testArchiveItem(index))
			errs <- err
		}()
	}
	close(start)

	for index := 0; index < 2; index++ {
		if err := <-errs; !errors.Is(err, copyErr) {
			t.Fatalf("Create error = %v want %v", err, copyErr)
		}
	}
}

func TestBatchingArchiveItemRepositoryReturnsInsertErrorToWholeBatch(t *testing.T) {
	insertErr := errors.New("archive insert failed")
	db := &batchRecordingDB{
		failOnStatement: "INSERT INTO teaching_archive_items",
		failErr:         insertErr,
	}
	repository := postgres.NewBatchingArchiveItemRepository(db, postgres.ArchiveCreateBatchConfig{
		MaxSize:  2,
		MaxDelay: time.Second,
	})
	defer repository.Close()
	start := make(chan struct{})
	errs := make(chan error, 2)

	for index := 0; index < 2; index++ {
		index := index
		go func() {
			<-start
			_, err := repository.Create(context.Background(), testArchiveItem(index))
			errs <- err
		}()
	}
	close(start)

	for index := 0; index < 2; index++ {
		if err := <-errs; !errors.Is(err, insertErr) {
			t.Fatalf("Create error = %v want %v", err, insertErr)
		}
	}
}

func TestBatchingArchiveItemRepositorySkipsCanceledRequestBeforeFlush(t *testing.T) {
	db := &batchRecordingDB{}
	repository := postgres.NewBatchingArchiveItemRepository(db, postgres.ArchiveCreateBatchConfig{
		MaxSize:  2,
		MaxDelay: time.Second,
	})

	ctx, cancel := context.WithCancel(context.Background())
	firstErr := make(chan error, 1)
	go func() {
		_, err := repository.Create(ctx, testArchiveItem(1))
		firstErr <- err
	}()

	time.Sleep(10 * time.Millisecond)
	cancel()

	secondErr := make(chan error, 1)
	go func() {
		_, err := repository.Create(context.Background(), testArchiveItem(2))
		secondErr <- err
	}()
	if err := <-firstErr; !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled Create error = %v want context.Canceled", err)
	}
	if err := <-secondErr; err != nil {
		t.Fatalf("active Create error = %v", err)
	}
	repository.Close()
	if db.acquireCount != 1 {
		t.Fatalf("Acquire count = %d want 1", db.acquireCount)
	}
	if len(db.args) != 11 {
		t.Fatalf("args = %d want 11", len(db.args))
	}
	if got := db.args[0]; got != "tarch_2" {
		t.Fatalf("inserted ID = %v want tarch_2", got)
	}
}

func TestBatchingArchiveItemRepositoryCloseFlushesQueuedRequest(t *testing.T) {
	db := &batchRecordingDB{}
	repository := postgres.NewBatchingArchiveItemRepository(db, postgres.ArchiveCreateBatchConfig{
		MaxSize:  2,
		MaxDelay: time.Hour,
	})

	errs := make(chan error, 1)
	go func() {
		_, err := repository.Create(context.Background(), testArchiveItem(3))
		errs <- err
	}()

	time.Sleep(10 * time.Millisecond)
	repository.Close()

	if err := <-errs; err != nil {
		t.Fatalf("queued Create error after Close = %v", err)
	}
	if db.acquireCount != 1 {
		t.Fatalf("Acquire count = %d want 1", db.acquireCount)
	}
	if len(db.args) != 11 {
		t.Fatalf("args = %d want 11", len(db.args))
	}
	if got := db.args[0]; got != "tarch_3" {
		t.Fatalf("inserted ID = %v want tarch_3", got)
	}
}

func TestBatchingArchiveItemRepositoryCreateAfterCloseReturnsClosedError(t *testing.T) {
	db := &batchRecordingDB{}
	repository := postgres.NewBatchingArchiveItemRepository(db, postgres.ArchiveCreateBatchConfig{
		MaxSize:  2,
		MaxDelay: time.Millisecond,
	})
	repository.Close()

	_, err := repository.Create(context.Background(), testArchiveItem(4))
	if !errors.Is(err, postgres.ErrArchiveRepositoryClosed) {
		t.Fatalf("Create error = %v want %v", err, postgres.ErrArchiveRepositoryClosed)
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
		"source_question_bank_draft_ref",
		"source_question_bank_answer_submission_id",
		"source_archive_ocr_status",
		"VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7, NULLIF($8, ''), $9, NULLIF($10, ''), NULLIF($11, ''), NULLIF($12, ''), NULLIF($13, ''), $14, $15, $16, $17)",
	} {
		if !strings.Contains(db.lastExecSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastExecSQL)
		}
	}
	if len(db.execArgs) != 17 {
		t.Fatalf("args = %d, want 17", len(db.execArgs))
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
