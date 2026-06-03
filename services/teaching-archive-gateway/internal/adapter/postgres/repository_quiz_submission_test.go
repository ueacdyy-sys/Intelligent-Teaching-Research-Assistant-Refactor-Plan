package postgres_test

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
)

func TestCreateQuizSubmissionInsertsMetadataOnly(t *testing.T) {
	db := &recordingDB{tag: commandTag{rowsAffected: 1}}
	repository := postgres.NewArchiveRepository(db)

	err := repository.CreateQuizSubmission(context.Background(), domain.QuizSubmission{
		ID:                     "quiz_sub_row",
		QuizArchiveItemID:      "tarch_quiz",
		StudentID:              "student_001",
		SubmittedByPrincipalID: "student_001",
		AnswerRef:              "local://answers/student_001/week-3.json",
		Status:                 domain.QuizSubmissionStatusSubmitted,
		SubmittedAt:            time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("CreateQuizSubmission returned error: %v", err)
	}

	for _, fragment := range []string{
		"INSERT INTO teaching_quiz_submissions",
		"quiz_archive_item_id",
		"submitted_by_principal_id",
		"answer_ref",
		"VALUES ($1, $2, $3, $4, $5, $6, $7)",
	} {
		if !strings.Contains(db.lastExecSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastExecSQL)
		}
	}
	if len(db.execArgs) != 7 {
		t.Fatalf("args = %d, want 7", len(db.execArgs))
	}
}

func TestCreateQuizSubmissionForExistingTeachingQuizConditionallyInsertsMetadata(t *testing.T) {
	db := &recordingDB{tag: commandTag{rowsAffected: 1}}
	repository := postgres.NewArchiveRepository(db)

	created, err := repository.CreateQuizSubmissionForExistingTeachingQuiz(
		context.Background(),
		domain.QuizSubmission{
			ID:                     "quiz_sub_row",
			QuizArchiveItemID:      "tarch_quiz",
			StudentID:              "student_001",
			SubmittedByPrincipalID: "student_001",
			AnswerRef:              "local://answers/student_001/week-3.json",
			Status:                 domain.QuizSubmissionStatusSubmitted,
			SubmittedAt:            time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC),
		},
	)
	if err != nil {
		t.Fatalf("CreateQuizSubmissionForExistingTeachingQuiz returned error: %v", err)
	}
	if !created {
		t.Fatalf("created = false, want true")
	}

	for _, fragment := range []string{
		"INSERT INTO teaching_quiz_submissions",
		"SELECT",
		"$1",
		"item.id",
		"FROM teaching_archive_items AS item",
		"WHERE item.id = $2",
		"item.owner_type = $8",
		"item.material_type = $9",
	} {
		if !strings.Contains(db.lastExecSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastExecSQL)
		}
	}
	if len(db.execArgs) != 9 {
		t.Fatalf("args = %d, want 9", len(db.execArgs))
	}
	if db.execArgs[7] != domain.OwnerTypeTeaching {
		t.Fatalf("owner type arg = %#v", db.execArgs[7])
	}
	if db.execArgs[8] != domain.MaterialTypeQuiz {
		t.Fatalf("material type arg = %#v", db.execArgs[8])
	}
}

func TestCreateQuizSubmissionForExistingTeachingQuizReturnsFalseWhenNoTeachingQuizMatches(t *testing.T) {
	db := &recordingDB{tag: commandTag{rowsAffected: 0}}
	repository := postgres.NewArchiveRepository(db)

	created, err := repository.CreateQuizSubmissionForExistingTeachingQuiz(
		context.Background(),
		domain.QuizSubmission{
			ID:                     "quiz_sub_row",
			QuizArchiveItemID:      "tarch_missing",
			StudentID:              "student_001",
			SubmittedByPrincipalID: "student_001",
			AnswerRef:              "local://answers/student_001/week-3.json",
			Status:                 domain.QuizSubmissionStatusSubmitted,
			SubmittedAt:            time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC),
		},
	)
	if err != nil {
		t.Fatalf("CreateQuizSubmissionForExistingTeachingQuiz returned error: %v", err)
	}
	if created {
		t.Fatalf("created = true, want false")
	}
}

func TestBatchingQuizSubmissionRepositoryGroupsKnownTeachingQuizCreates(t *testing.T) {
	db := &quizSubmissionBatchRecordingDB{
		returnedIDs: []string{"quiz_sub_0", "quiz_sub_1", "quiz_sub_2"},
	}
	repository := postgres.NewBatchingQuizSubmissionRepository(db, postgres.QuizSubmissionBatchConfig{
		MaxSize:  3,
		MaxDelay: time.Second,
	})
	start := make(chan struct{})
	results := make(chan quizSubmissionCreateResult, 3)
	timings := make([]*platform.TeachingArchiveTiming, 3)

	for index := 0; index < 3; index++ {
		index := index
		timings[index] = &platform.TeachingArchiveTiming{}
		go func() {
			<-start
			ctx := platform.WithTeachingArchiveTiming(context.Background(), timings[index])
			created, err := repository.CreateQuizSubmissionForExistingTeachingQuiz(ctx, testQuizSubmission(index))
			results <- quizSubmissionCreateResult{created: created, err: err}
		}()
	}
	close(start)

	for index := 0; index < 3; index++ {
		result := <-results
		if result.err != nil {
			t.Fatalf("CreateQuizSubmissionForExistingTeachingQuiz returned error: %v", result.err)
		}
		if !result.created {
			t.Fatalf("created = false, want true")
		}
	}
	repository.Close()

	if db.queryCount != 1 {
		t.Fatalf("queryCount = %d want 1", db.queryCount)
	}
	for _, fragment := range []string{
		"WITH input",
		"::timestamptz",
		"INSERT INTO teaching_quiz_submissions",
		"JOIN teaching_archive_items AS item",
		"RETURNING id",
	} {
		if !strings.Contains(db.lastQuery, fragment) {
			t.Fatalf("query missing %q in: %s", fragment, db.lastQuery)
		}
	}
	if len(db.args) != 23 {
		t.Fatalf("args = %d want 23", len(db.args))
	}
	for index, timing := range timings {
		if timing.DBBatchWait <= 0 {
			t.Fatalf("timing[%d].DBBatchWait = %s want > 0", index, timing.DBBatchWait)
		}
		if timing.DBExec <= 0 {
			t.Fatalf("timing[%d].DBExec = %s want > 0", index, timing.DBExec)
		}
		if timing.DBInsert <= 0 {
			t.Fatalf("timing[%d].DBInsert = %s want > 0", index, timing.DBInsert)
		}
	}
}

func TestBatchingQuizSubmissionRepositoryReturnsFalseForMissingTeachingQuiz(t *testing.T) {
	db := &quizSubmissionBatchRecordingDB{returnedIDs: []string{"quiz_sub_1"}}
	repository := postgres.NewBatchingQuizSubmissionRepository(db, postgres.QuizSubmissionBatchConfig{
		MaxSize:  2,
		MaxDelay: time.Second,
	})
	start := make(chan struct{})
	results := make(chan quizSubmissionIndexedResult, 2)

	for index := 0; index < 2; index++ {
		index := index
		go func() {
			<-start
			created, err := repository.CreateQuizSubmissionForExistingTeachingQuiz(context.Background(), testQuizSubmission(index))
			results <- quizSubmissionIndexedResult{index: index, created: created, err: err}
		}()
	}
	close(start)

	createdByIndex := map[int]bool{}
	for index := 0; index < 2; index++ {
		result := <-results
		if result.err != nil {
			t.Fatalf("CreateQuizSubmissionForExistingTeachingQuiz returned error: %v", result.err)
		}
		createdByIndex[result.index] = result.created
	}
	repository.Close()

	if createdByIndex[0] {
		t.Fatalf("created[0] = true, want false")
	}
	if !createdByIndex[1] {
		t.Fatalf("created[1] = false, want true")
	}
}

type quizSubmissionCreateResult struct {
	created bool
	err     error
}

type quizSubmissionIndexedResult struct {
	index   int
	created bool
	err     error
}

type quizSubmissionBatchRecordingDB struct {
	mu          sync.Mutex
	queryCount  int
	lastQuery   string
	args        []any
	returnedIDs []string
}

func (db *quizSubmissionBatchRecordingDB) Exec(_ context.Context, query string, args ...any) (postgres.CommandTag, error) {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.lastQuery = query
	db.args = append([]any(nil), args...)
	return commandTag{rowsAffected: 1}, nil
}

func (db *quizSubmissionBatchRecordingDB) Query(_ context.Context, query string, args ...any) (postgres.Rows, error) {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.queryCount += 1
	db.lastQuery = query
	db.args = append([]any(nil), args...)
	return &quizSubmissionIDRows{ids: append([]string(nil), db.returnedIDs...)}, nil
}

type quizSubmissionIDRows struct {
	ids      []string
	position int
}

func (rows *quizSubmissionIDRows) Close() {}

func (rows *quizSubmissionIDRows) Next() bool {
	return rows.position < len(rows.ids)
}

func (rows *quizSubmissionIDRows) Scan(dest ...any) error {
	*(dest[0].(*string)) = rows.ids[rows.position]
	rows.position += 1
	return nil
}

func (rows *quizSubmissionIDRows) Err() error {
	return nil
}

func testQuizSubmission(index int) domain.QuizSubmission {
	return domain.QuizSubmission{
		ID:                     "quiz_sub_" + strconv.Itoa(index),
		QuizArchiveItemID:      "tarch_" + strconv.Itoa(index),
		StudentID:              "student_001",
		SubmittedByPrincipalID: "student_001",
		AnswerRef:              "local://answers/student_001/week-3-" + strconv.Itoa(index) + ".json",
		Status:                 domain.QuizSubmissionStatusSubmitted,
		SubmittedAt:            time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC).Add(time.Duration(index) * time.Second),
	}
}
