package postgres_test

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"ita-refactor/services/conversation-write-gateway/internal/adapter/postgres"
	"ita-refactor/services/conversation-write-gateway/internal/domain"
	"ita-refactor/services/conversation-write-gateway/internal/platform"
)

func TestEnsureSchemaCreatesConversationTableAndIndexes(t *testing.T) {
	db := &fakeDB{}

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema() error = %v", err)
	}

	joined := strings.Join(db.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS research_conversations",
		"settings JSONB",
		"CREATE INDEX IF NOT EXISTS ix_research_conversations_updated_at",
	} {
		if !strings.Contains(joined, fragment) {
			t.Fatalf("schema statements missing %q in:\n%s", fragment, joined)
		}
	}
	if strings.Contains(joined, "ix_research_conversations_title") {
		t.Fatalf("fresh write schema should defer title index creation:\n%s", joined)
	}
}

func TestEnsureSchemaUsesSingleConnectionAdvisoryLock(t *testing.T) {
	db := &fakeDB{}

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema() error = %v", err)
	}

	if db.acquireCount != 1 {
		t.Fatalf("Acquire count = %d want 1", db.acquireCount)
	}
	if db.releaseCount != 1 {
		t.Fatalf("Release count = %d want 1", db.releaseCount)
	}
	if got := db.statements[0]; got != "BEGIN" {
		t.Fatalf("first statement = %q want BEGIN", got)
	}
	if got := db.statements[1]; !strings.Contains(got, "pg_advisory_xact_lock") {
		t.Fatalf("second statement = %q want transaction advisory lock", got)
	}
	if got := db.statements[len(db.statements)-1]; got != "COMMIT" {
		t.Fatalf("last statement = %q want COMMIT", got)
	}
}

func TestEnsureSchemaRollsBackOnSchemaError(t *testing.T) {
	db := &fakeDB{
		failOnStatement: "CREATE TABLE IF NOT EXISTS research_conversations",
		failErr:         errors.New("ddl failed"),
	}

	err := postgres.EnsureSchema(context.Background(), db)
	if err == nil {
		t.Fatal("EnsureSchema() error = nil, want DDL error")
	}
	if !errors.Is(err, db.failErr) {
		t.Fatalf("EnsureSchema() error = %v want %v", err, db.failErr)
	}
	if db.releaseCount != 1 {
		t.Fatalf("Release count = %d want 1", db.releaseCount)
	}
	if got := db.statements[len(db.statements)-1]; got != "ROLLBACK" {
		t.Fatalf("last statement = %q want ROLLBACK", got)
	}
}

func TestRepositoryCreateUsesExecutorPortAndJSONBSettings(t *testing.T) {
	db := &fakeDB{}
	repository := postgres.NewConversationRepository(db)
	createdAt := time.Date(2026, 5, 31, 8, 0, 0, 0, time.UTC)
	rawSettings := `{"fusionMode":"balanced","nested":{"strategy":"fast"}}`

	err := repository.Create(context.Background(), domain.Conversation{
		ID:           "conv_test",
		Title:        "Research",
		CreatedAt:    createdAt,
		UpdatedAt:    createdAt,
		MessageCount: 0,
		TotalTokens:  0,
		Settings:     domain.NewSettingsJSON([]byte(rawSettings)),
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if len(db.statements) != 1 {
		t.Fatalf("statements = %d want 1", len(db.statements))
	}
	if !strings.Contains(db.statements[0], "$7::jsonb") {
		t.Fatalf("insert should cast settings as jsonb: %s", db.statements[0])
	}
	if got := db.args[6]; got != rawSettings {
		t.Fatalf("settings arg = %#v", got)
	}
}

func TestRepositoryCreateRecordsDatabaseTimings(t *testing.T) {
	db := &fakeDB{acquireDelay: time.Millisecond, execDelay: time.Millisecond}
	repository := postgres.NewConversationRepository(db)
	timing := &platform.ConversationTiming{}
	ctx := platform.WithConversationTiming(context.Background(), timing)
	createdAt := time.Date(2026, 5, 31, 8, 0, 0, 0, time.UTC)

	err := repository.Create(ctx, domain.Conversation{
		ID:        "conv_test",
		Title:     "Research",
		CreatedAt: createdAt,
		UpdatedAt: createdAt,
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if timing.DBAcquire <= 0 {
		t.Fatalf("DBAcquire = %s want > 0", timing.DBAcquire)
	}
	if timing.DBInsert <= 0 {
		t.Fatalf("DBInsert = %s want > 0", timing.DBInsert)
	}
}

func TestBatchingRepositoryGroupsConcurrentCreatesIntoSingleInsert(t *testing.T) {
	db := &fakeDB{}
	repository := postgres.NewBatchingConversationRepository(db, postgres.BatchConfig{
		MaxSize:  3,
		MaxDelay: time.Second,
	})
	start := make(chan struct{})
	errs := make(chan error, 3)
	timings := make([]*platform.ConversationTiming, 3)

	for index := 0; index < 3; index++ {
		index := index
		timings[index] = &platform.ConversationTiming{}
		go func() {
			<-start
			ctx := platform.WithConversationTiming(context.Background(), timings[index])
			errs <- repository.Create(ctx, testConversation(index))
		}()
	}
	close(start)

	for index := 0; index < 3; index++ {
		if err := <-errs; err != nil {
			t.Fatalf("Create() error = %v", err)
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
	if got := strings.Count(db.statements[0], "::jsonb"); got != 3 {
		t.Fatalf("multi-row insert should contain 3 jsonb casts, got %d in:\n%s", got, db.statements[0])
	}
	if len(db.args) != 21 {
		t.Fatalf("args = %d want 21", len(db.args))
	}
	for index, timing := range timings {
		if timing.DBBatchWait <= 0 {
			t.Fatalf("timing[%d].DBBatchWait = %s want > 0", index, timing.DBBatchWait)
		}
		if timing.DBAcquire <= 0 {
			t.Fatalf("timing[%d].DBAcquire = %s want > 0", index, timing.DBAcquire)
		}
		if timing.DBInsert <= 0 {
			t.Fatalf("timing[%d].DBInsert = %s want > 0", index, timing.DBInsert)
		}
	}
}

func TestBatchingRepositoryReturnsInsertErrorToWholeBatch(t *testing.T) {
	db := &fakeDB{
		failOnStatement: "INSERT INTO research_conversations",
		failErr:         errors.New("insert failed"),
	}
	repository := postgres.NewBatchingConversationRepository(db, postgres.BatchConfig{
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
			errs <- repository.Create(context.Background(), testConversation(index))
		}()
	}
	close(start)

	for index := 0; index < 2; index++ {
		if err := <-errs; !errors.Is(err, db.failErr) {
			t.Fatalf("Create() error = %v want %v", err, db.failErr)
		}
	}
}

func TestBatchingRepositoryCopyModeUsesCopyFromForWholeBatch(t *testing.T) {
	db := &fakeDB{}
	repository := postgres.NewBatchingConversationRepository(db, postgres.BatchConfig{
		MaxSize:  3,
		MaxDelay: time.Second,
		Mode:     postgres.BatchWriteModeCopy,
	})
	start := make(chan struct{})
	errs := make(chan error, 3)
	timings := make([]*platform.ConversationTiming, 3)

	for index := 0; index < 3; index++ {
		index := index
		timings[index] = &platform.ConversationTiming{}
		go func() {
			<-start
			ctx := platform.WithConversationTiming(context.Background(), timings[index])
			errs <- repository.Create(ctx, testConversation(index))
		}()
	}
	close(start)

	for index := 0; index < 3; index++ {
		if err := <-errs; err != nil {
			t.Fatalf("Create() error = %v", err)
		}
	}
	repository.Close()

	if db.acquireCount != 1 {
		t.Fatalf("Acquire count = %d want 1", db.acquireCount)
	}
	if db.copyCount != 1 {
		t.Fatalf("CopyFrom count = %d want 1", db.copyCount)
	}
	if len(db.statements) != 0 {
		t.Fatalf("Exec statements = %d want 0", len(db.statements))
	}
	if got := strings.Join(db.copyTable, "."); got != "research_conversations" {
		t.Fatalf("copy table = %q want research_conversations", got)
	}
	if strings.Join(db.copyColumns, ",") != "id,title,created_at,updated_at,message_count,total_tokens,settings" {
		t.Fatalf("copy columns = %#v", db.copyColumns)
	}
	if len(db.copyRows) != 3 {
		t.Fatalf("copy rows = %d want 3", len(db.copyRows))
	}
	copiedRow := findCopyRowByID(db.copyRows, "conv_2")
	if copiedRow == nil {
		t.Fatalf("copy rows missing conv_2: %#v", db.copyRows)
	}
	if got := copiedRow[6]; got != `{"fusionMode":"balanced"}` {
		t.Fatalf("copied settings = %#v", got)
	}
	for index, timing := range timings {
		if timing.DBBatchWait <= 0 {
			t.Fatalf("timing[%d].DBBatchWait = %s want > 0", index, timing.DBBatchWait)
		}
		if timing.DBAcquire <= 0 {
			t.Fatalf("timing[%d].DBAcquire = %s want > 0", index, timing.DBAcquire)
		}
		if timing.DBInsert <= 0 {
			t.Fatalf("timing[%d].DBInsert = %s want > 0", index, timing.DBInsert)
		}
	}
}

func TestBatchingRepositoryCopyModeReturnsCopyErrorToWholeBatch(t *testing.T) {
	db := &fakeDB{copyErr: errors.New("copy failed")}
	repository := postgres.NewBatchingConversationRepository(db, postgres.BatchConfig{
		MaxSize:  2,
		MaxDelay: time.Second,
		Mode:     postgres.BatchWriteModeCopy,
	})
	defer repository.Close()
	start := make(chan struct{})
	errs := make(chan error, 2)

	for index := 0; index < 2; index++ {
		index := index
		go func() {
			<-start
			errs <- repository.Create(context.Background(), testConversation(index))
		}()
	}
	close(start)

	for index := 0; index < 2; index++ {
		if err := <-errs; !errors.Is(err, db.copyErr) {
			t.Fatalf("Create() error = %v want %v", err, db.copyErr)
		}
	}
}

func TestBatchingRepositorySkipsCanceledRequestBeforeFlush(t *testing.T) {
	db := &fakeDB{}
	repository := postgres.NewBatchingConversationRepository(db, postgres.BatchConfig{
		MaxSize:  2,
		MaxDelay: time.Second,
	})

	ctx, cancel := context.WithCancel(context.Background())
	firstErr := make(chan error, 1)
	go func() {
		firstErr <- repository.Create(ctx, testConversation(1))
	}()

	time.Sleep(10 * time.Millisecond)
	cancel()

	secondErr := make(chan error, 1)
	go func() {
		secondErr <- repository.Create(context.Background(), testConversation(2))
	}()
	if err := <-firstErr; !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled Create() error = %v want context.Canceled", err)
	}
	if err := <-secondErr; err != nil {
		t.Fatalf("active Create() error = %v", err)
	}
	repository.Close()
	if db.acquireCount != 1 {
		t.Fatalf("Acquire count = %d want 1", db.acquireCount)
	}
	if len(db.args) != 7 {
		t.Fatalf("args = %d want 7", len(db.args))
	}
	if got := db.args[0]; got != "conv_2" {
		t.Fatalf("inserted ID = %v want conv_2", got)
	}
}

func TestBatchingRepositoryCloseFlushesQueuedRequest(t *testing.T) {
	db := &fakeDB{}
	repository := postgres.NewBatchingConversationRepository(db, postgres.BatchConfig{
		MaxSize:  2,
		MaxDelay: time.Hour,
	})

	errs := make(chan error, 1)
	go func() {
		errs <- repository.Create(context.Background(), testConversation(3))
	}()

	time.Sleep(10 * time.Millisecond)
	repository.Close()

	if err := <-errs; err != nil {
		t.Fatalf("queued Create() error after Close() = %v", err)
	}
	if db.acquireCount != 1 {
		t.Fatalf("Acquire count = %d want 1", db.acquireCount)
	}
	if len(db.args) != 7 {
		t.Fatalf("args = %d want 7", len(db.args))
	}
	if got := db.args[0]; got != "conv_3" {
		t.Fatalf("inserted ID = %v want conv_3", got)
	}
}

func TestBatchingRepositoryCreateAfterCloseReturnsClosedError(t *testing.T) {
	db := &fakeDB{}
	repository := postgres.NewBatchingConversationRepository(db, postgres.BatchConfig{
		MaxSize:  2,
		MaxDelay: time.Millisecond,
	})
	repository.Close()

	err := repository.Create(context.Background(), testConversation(4))
	if !errors.Is(err, postgres.ErrConversationRepositoryClosed) {
		t.Fatalf("Create() error = %v want %v", err, postgres.ErrConversationRepositoryClosed)
	}
}

func TestBatchingRepositoryCloseUnblocksCreateWaitingForQueueSpace(t *testing.T) {
	execStarted := make(chan struct{})
	execBlock := make(chan struct{})
	db := &fakeDB{
		execStarted: execStarted,
		execBlock:   execBlock,
	}
	repository := postgres.NewBatchingConversationRepository(db, postgres.BatchConfig{
		MaxSize:  2,
		MaxDelay: time.Hour,
	})

	accepted := make(chan error, 10)
	for index := 0; index < 2; index++ {
		index := index
		go func() {
			accepted <- repository.Create(context.Background(), testConversation(index))
		}()
	}
	waitForSignal(t, execStarted, "first batch insert")

	for index := 2; index < 10; index++ {
		index := index
		go func() {
			accepted <- repository.Create(context.Background(), testConversation(index))
		}()
	}
	time.Sleep(10 * time.Millisecond)

	blockedErr := make(chan error, 1)
	go func() {
		blockedErr <- repository.Create(context.Background(), testConversation(10))
	}()
	time.Sleep(10 * time.Millisecond)

	closeDone := make(chan struct{})
	go func() {
		repository.Close()
		close(closeDone)
	}()

	select {
	case err := <-blockedErr:
		if !errors.Is(err, postgres.ErrConversationRepositoryClosed) {
			t.Fatalf("blocked Create() error = %v want %v", err, postgres.ErrConversationRepositoryClosed)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("Close() did not unblock Create() waiting for queue space")
	}

	close(execBlock)
	select {
	case <-closeDone:
	case <-time.After(time.Second):
		t.Fatal("Close() did not finish after the blocked insert was released")
	}
	for index := 0; index < 10; index++ {
		if err := <-accepted; err != nil {
			t.Fatalf("accepted Create() error = %v", err)
		}
	}
}

func TestBatchingRepositoryZeroDelayFlushesSparseCreateWithoutWaitingForMaxSize(t *testing.T) {
	db := &fakeDB{}
	repository := postgres.NewBatchingConversationRepository(db, postgres.BatchConfig{
		MaxSize:  64,
		MaxDelay: 0,
	})
	defer repository.Close()

	errs := make(chan error, 1)
	go func() {
		errs <- repository.Create(context.Background(), testConversation(11))
	}()

	select {
	case err := <-errs:
		if err != nil {
			t.Fatalf("Create() error = %v", err)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("sparse delay0 Create() waited for batch size instead of flushing immediately")
	}
	if db.acquireCount != 1 {
		t.Fatalf("Acquire count = %d want 1", db.acquireCount)
	}
	if len(db.args) != 7 {
		t.Fatalf("args = %d want 7", len(db.args))
	}
	if got := db.args[0]; got != "conv_11" {
		t.Fatalf("inserted ID = %v want conv_11", got)
	}
}

type fakeDB struct {
	mu              sync.Mutex
	statements      []string
	args            []any
	acquireCount    int
	releaseCount    int
	acquireDelay    time.Duration
	execDelay       time.Duration
	failOnStatement string
	failErr         error
	execStarted     chan struct{}
	execBlock       chan struct{}
	execStartedOnce sync.Once
	copyCount       int
	copyTable       []string
	copyColumns     []string
	copyRows        [][]any
	copyErr         error
}

func (f *fakeDB) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if f.execStarted != nil {
		f.execStartedOnce.Do(func() {
			close(f.execStarted)
		})
	}
	if f.execBlock != nil {
		<-f.execBlock
	}
	if f.execDelay > 0 {
		time.Sleep(f.execDelay)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.statements = append(f.statements, sql)
	f.args = args
	if f.failOnStatement != "" && strings.Contains(sql, f.failOnStatement) {
		return pgconn.CommandTag{}, f.failErr
	}
	return pgconn.CommandTag{}, nil
}

func (f *fakeDB) Acquire(context.Context) (postgres.Conn, error) {
	if f.acquireDelay > 0 {
		time.Sleep(f.acquireDelay)
	}
	f.mu.Lock()
	f.acquireCount++
	f.mu.Unlock()
	return fakeConn{db: f}, nil
}

func (f *fakeDB) CopyFrom(_ context.Context, tableName pgx.Identifier, columnNames []string, rowSrc pgx.CopyFromSource) (int64, error) {
	if f.execStarted != nil {
		f.execStartedOnce.Do(func() {
			close(f.execStarted)
		})
	}
	if f.execBlock != nil {
		<-f.execBlock
	}
	if f.execDelay > 0 {
		time.Sleep(f.execDelay)
	}
	rows := [][]any{}
	for rowSrc.Next() {
		values, err := rowSrc.Values()
		if err != nil {
			return int64(len(rows)), err
		}
		copied := make([]any, len(values))
		copy(copied, values)
		rows = append(rows, copied)
	}
	if err := rowSrc.Err(); err != nil {
		return int64(len(rows)), err
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	f.copyCount++
	f.copyTable = append([]string(nil), tableName...)
	f.copyColumns = append([]string(nil), columnNames...)
	f.copyRows = rows
	if f.copyErr != nil {
		return 0, f.copyErr
	}
	return int64(len(rows)), nil
}

type fakeConn struct {
	db *fakeDB
}

func (f fakeConn) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return f.db.Exec(ctx, sql, args...)
}

func (f fakeConn) CopyFrom(ctx context.Context, tableName pgx.Identifier, columnNames []string, rowSrc pgx.CopyFromSource) (int64, error) {
	return f.db.CopyFrom(ctx, tableName, columnNames, rowSrc)
}

func (f fakeConn) Release() {
	f.db.mu.Lock()
	defer f.db.mu.Unlock()
	f.db.releaseCount++
}

func testConversation(index int) domain.Conversation {
	createdAt := time.Date(2026, 6, 1, 9, 0, 0, 0, time.UTC)
	return domain.Conversation{
		ID:           "conv_" + strconv.Itoa(index),
		Title:        "Research",
		CreatedAt:    createdAt,
		UpdatedAt:    createdAt,
		MessageCount: index,
		TotalTokens:  index * 10,
		Settings:     domain.NewSettingsJSON([]byte(`{"fusionMode":"balanced"}`)),
	}
}

func findCopyRowByID(rows [][]any, id string) []any {
	for _, row := range rows {
		if len(row) > 0 && row[0] == id {
			return row
		}
	}
	return nil
}

func waitForSignal(t *testing.T, signal <-chan struct{}, name string) {
	t.Helper()
	select {
	case <-signal:
	case <-time.After(time.Second):
		t.Fatalf("timed out waiting for %s", name)
	}
}
