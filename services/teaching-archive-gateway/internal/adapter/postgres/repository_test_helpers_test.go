package postgres_test

import (
	"context"
	"database/sql"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

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

type batchRecordingDB struct {
	mu              sync.Mutex
	statements      []string
	args            []any
	copyCount       int
	copyTable       []string
	copyColumns     []string
	copyRows        [][]any
	copyErr         error
	acquireCount    int
	releaseCount    int
	failOnStatement string
	failErr         error
}

func (db *batchRecordingDB) Exec(_ context.Context, statement string, args ...any) (postgres.CommandTag, error) {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.statements = append(db.statements, statement)
	db.args = append([]any(nil), args...)
	if db.failOnStatement != "" && strings.Contains(statement, db.failOnStatement) {
		return nil, db.failErr
	}
	return commandTag{rowsAffected: 1}, nil
}

func (db *batchRecordingDB) Query(_ context.Context, _ string, _ ...any) (postgres.Rows, error) {
	return &emptyRows{}, nil
}

func (db *batchRecordingDB) Acquire(context.Context) (postgres.Conn, error) {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.acquireCount += 1
	return batchRecordingConn{db: db}, nil
}

type batchRecordingConn struct {
	db *batchRecordingDB
}

func (conn batchRecordingConn) Exec(ctx context.Context, statement string, args ...any) (postgres.CommandTag, error) {
	return conn.db.Exec(ctx, statement, args...)
}

func (conn batchRecordingConn) CopyFrom(
	_ context.Context,
	tableName pgx.Identifier,
	columnNames []string,
	rowSrc pgx.CopyFromSource,
) (int64, error) {
	rows := [][]any{}
	for rowSrc.Next() {
		values, err := rowSrc.Values()
		if err != nil {
			return 0, err
		}
		copied := append([]any(nil), values...)
		rows = append(rows, copied)
	}
	if err := rowSrc.Err(); err != nil {
		return 0, err
	}
	conn.db.mu.Lock()
	defer conn.db.mu.Unlock()
	conn.db.copyCount++
	conn.db.copyTable = append([]string(nil), tableName...)
	conn.db.copyColumns = append([]string(nil), columnNames...)
	conn.db.copyRows = rows
	if conn.db.copyErr != nil {
		return 0, conn.db.copyErr
	}
	return int64(len(rows)), nil
}

func (conn batchRecordingConn) Release() {
	conn.db.mu.Lock()
	defer conn.db.mu.Unlock()
	conn.db.releaseCount += 1
}

func findCopyRowByID(rows [][]any, id string) []any {
	for _, row := range rows {
		if len(row) > 0 && row[0] == id {
			return row
		}
	}
	return nil
}

func testArchiveItem(index int) domain.ArchiveItem {
	createdAt := time.Date(2026, 6, 3, 10, 0, 0, 0, time.UTC)
	return domain.ArchiveItem{
		ID:              "tarch_" + strconv.Itoa(index),
		OwnerType:       domain.OwnerTypeTeaching,
		MaterialType:    domain.MaterialTypeQuiz,
		Title:           "Week 3 Quiz",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://archive/quiz-" + strconv.Itoa(index) + ".json",
		Tags:            []string{"performance"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentAIGrading, domain.AnalysisIntentArchiveOnly},
		OCRStatus:       domain.OCRStatusReserved,
		CreatedAt:       createdAt.Add(time.Duration(index) * time.Second),
	}
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
	sourceType          domain.StudentAppAITutorLearningActionSourceType
	followUpDepth       int
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
	sourceType := r.sourceType
	if sourceType == "" {
		sourceType = domain.StudentAppAITutorLearningActionSourcePublishedStudyPacket
	}
	*(dest[6].(*string)) = string(sourceType)
	*(dest[7].(*int)) = r.followUpDepth
	*(dest[8].(*string)) = string(domain.OwnerTypeStudent)
	*(dest[9].(*sql.NullString)) = sql.NullString{String: "student_001", Valid: true}
	*(dest[10].(*string)) = string(domain.MaterialTypeQuiz)
	*(dest[11].(*sql.NullString)) = sql.NullString{}
	*(dest[12].(*sql.NullString)) = sql.NullString{}
	*(dest[13].(*sql.NullString)) = sql.NullString{}
	*(dest[14].(*sql.NullString)) = sql.NullString{}
	*(dest[15].(*sql.NullString)) = sql.NullString{}
	*(dest[16].(*sql.NullString)) = sql.NullString{String: r.claimedByWorkerID, Valid: r.claimedByWorkerID != ""}
	*(dest[17].(*sql.NullTime)) = sql.NullTime{Time: r.claimExpiresAt, Valid: r.claimExpiresAtValid}
	*(dest[18].(*time.Time)) = time.Date(2026, 5, 29, 10, 1, 0, 0, time.UTC)
	*(dest[19].(*sql.NullTime)) = sql.NullTime{}
	*(dest[20].(*sql.NullTime)) = sql.NullTime{}
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
