package main

import (
	"context"
	"errors"
	"net"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"ita-refactor/services/conversation-write-gateway/internal/adapter/postgres"
)

func TestParseConversationPostgresPoolSettingsDefaultsToExistingWarmPool(t *testing.T) {
	settings, err := parseConversationPostgresPoolSettings(func(string) string { return "" })
	if err != nil {
		t.Fatalf("parseConversationPostgresPoolSettings returned error: %v", err)
	}

	if settings != (conversationPostgresPoolSettings{MaxConns: 8, MinConns: 8, PrewarmConns: 1}) {
		t.Fatalf("settings = %#v", settings)
	}
}

func TestParseConversationPostgresPoolSettingsAcceptsProductionWarmPool(t *testing.T) {
	env := map[string]string{
		"DB_MAX_CONNS":     "32",
		"DB_MIN_CONNS":     "12",
		"DB_PREWARM_CONNS": "12",
	}
	settings, err := parseConversationPostgresPoolSettings(func(key string) string { return env[key] })
	if err != nil {
		t.Fatalf("parseConversationPostgresPoolSettings returned error: %v", err)
	}

	if settings != (conversationPostgresPoolSettings{MaxConns: 32, MinConns: 12, PrewarmConns: 12}) {
		t.Fatalf("settings = %#v", settings)
	}
}

func TestParseConversationPostgresPoolSettingsRejectsOversizedWarmPool(t *testing.T) {
	for name, env := range map[string]map[string]string{
		"min": {
			"DB_MAX_CONNS": "8",
			"DB_MIN_CONNS": "9",
		},
		"prewarm": {
			"DB_MAX_CONNS":     "8",
			"DB_PREWARM_CONNS": "9",
		},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := parseConversationPostgresPoolSettings(func(key string) string { return env[key] }); err == nil {
				t.Fatalf("parseConversationPostgresPoolSettings returned nil error")
			}
		})
	}
}

func TestApplyConversationPostgresPoolSettingsMapsToPgxPoolConfig(t *testing.T) {
	config, err := pgxpool.ParseConfig("postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable")
	if err != nil {
		t.Fatalf("ParseConfig returned error: %v", err)
	}

	applyConversationPostgresPoolSettings(config, conversationPostgresPoolSettings{MaxConns: 32, MinConns: 12, PrewarmConns: 12})

	if config.MaxConns != 32 {
		t.Fatalf("MaxConns = %d, want 32", config.MaxConns)
	}
	if config.MinConns != 12 {
		t.Fatalf("MinConns = %d, want 12", config.MinConns)
	}
}

func TestRetryConversationStartupOperationRetriesTransientFailure(t *testing.T) {
	attempts := 0

	err := retryConversationStartupOperation(context.Background(), 3, 0, func() error {
		attempts += 1
		if attempts < 3 {
			return errors.New("transient connect refused")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("retryConversationStartupOperation returned error: %v", err)
	}
	if attempts != 3 {
		t.Fatalf("attempts = %d, want 3", attempts)
	}
}

func TestRetryConversationStartupOperationStopsAfterAttempts(t *testing.T) {
	transientErr := errors.New("transient connect refused")
	attempts := 0

	err := retryConversationStartupOperation(context.Background(), 3, 0, func() error {
		attempts += 1
		return transientErr
	})
	if !errors.Is(err, transientErr) {
		t.Fatalf("retryConversationStartupOperation error = %v, want %v", err, transientErr)
	}
	if attempts != 3 {
		t.Fatalf("attempts = %d, want 3", attempts)
	}
}

func TestConversationRepositoryFromConfigDisablesBatchingByDefault(t *testing.T) {
	t.Setenv("CONVERSATION_WRITE_BATCH_SIZE", "")
	t.Setenv("CONVERSATION_WRITE_BATCH_DELAY_MS", "")
	t.Setenv("CONVERSATION_WRITE_BATCH_WORKERS", "")
	t.Setenv("CONVERSATION_WRITE_BATCH_MODE", "")
	t.Setenv("CONVERSATION_WRITE_ACCEPTANCE_MODE", "")

	bundle := conversationRepositoryFromConfig(fakeConfigDB{})

	if _, ok := bundle.Repository.(*postgres.ConversationRepository); !ok {
		t.Fatalf("repository type = %T want *postgres.ConversationRepository", bundle.Repository)
	}
	if bundle.CommandLogProvider != nil {
		t.Fatalf("command log provider = %T want nil", bundle.CommandLogProvider)
	}
}

func TestConversationRepositoryFromConfigEnablesBatchingOnlyAboveOne(t *testing.T) {
	t.Setenv("CONVERSATION_WRITE_BATCH_SIZE", "8")
	t.Setenv("CONVERSATION_WRITE_BATCH_DELAY_MS", "2")
	t.Setenv("CONVERSATION_WRITE_BATCH_WORKERS", "3")
	t.Setenv("CONVERSATION_WRITE_BATCH_MODE", "copy")
	t.Setenv("CONVERSATION_WRITE_ACCEPTANCE_MODE", "")

	bundle := conversationRepositoryFromConfig(fakeConfigDB{})

	batchingRepository, ok := bundle.Repository.(*postgres.BatchingConversationRepository)
	if !ok {
		t.Fatalf("repository type = %T want *postgres.BatchingConversationRepository", bundle.Repository)
	}
	defer batchingRepository.Close()
	if batchingRepository.WorkerCount() != 3 {
		t.Fatalf("batch workers = %d want 3", batchingRepository.WorkerCount())
	}
	if batchingRepository.WriteMode() != postgres.BatchWriteModeCopy {
		t.Fatalf("batch mode = %q want copy", batchingRepository.WriteMode())
	}
}

func TestConversationRepositoryFromConfigEnablesDurableCommandLog(t *testing.T) {
	t.Setenv("CONVERSATION_WRITE_ACCEPTANCE_MODE", "durable-log")
	t.Setenv("CONVERSATION_COMMAND_LOG_PATH", t.TempDir()+"/conversation-commands.jsonl")
	t.Setenv("CONVERSATION_COMMAND_LOG_SYNC", "false")
	t.Setenv("CONVERSATION_COMMAND_LOG_APPEND_BATCH_SIZE", "4")
	t.Setenv("CONVERSATION_COMMAND_LOG_QUEUE_CAPACITY", "16")
	t.Setenv("CONVERSATION_COMMAND_LOG_PROJECTION_WORKERS", "1")

	bundle := conversationRepositoryFromConfig(fakeConfigDB{})
	defer bundle.Close()

	if bundle.CommandLogProvider == nil {
		t.Fatal("command log provider is nil")
	}
	stats := bundle.CommandLogProvider.ConversationCommandLogStats()
	if stats.QueueCapacity != 16 {
		t.Fatalf("queue capacity = %d want 16", stats.QueueCapacity)
	}
}

func TestConnectionStateTrackerCountsLifecycleTransitions(t *testing.T) {
	tracker := newConnectionStateTracker()
	left, right := net.Pipe()
	defer left.Close()
	defer right.Close()

	tracker.ConnState(left, http.StateNew)
	stats := tracker.ConversationRuntimeStats()
	if stats.AcceptedConns != 1 || stats.CurrentConns != 1 || stats.MaxCurrentConns != 1 {
		t.Fatalf("new stats = %#v", stats)
	}

	tracker.ConnState(left, http.StateActive)
	stats = tracker.ConversationRuntimeStats()
	if stats.ActiveConns != 1 || stats.IdleConns != 0 || stats.CurrentConns != 1 {
		t.Fatalf("active stats = %#v", stats)
	}

	tracker.ConnState(left, http.StateIdle)
	stats = tracker.ConversationRuntimeStats()
	if stats.ActiveConns != 0 || stats.IdleConns != 1 || stats.CurrentConns != 1 {
		t.Fatalf("idle stats = %#v", stats)
	}

	tracker.ConnState(left, http.StateClosed)
	stats = tracker.ConversationRuntimeStats()
	if stats.CurrentConns != 0 || stats.IdleConns != 0 || stats.ClosedConns != 1 {
		t.Fatalf("closed stats = %#v", stats)
	}
}

func TestConnectionStateTrackerCountsHijackedConnections(t *testing.T) {
	tracker := newConnectionStateTracker()
	left, right := net.Pipe()
	defer left.Close()
	defer right.Close()

	tracker.ConnState(left, http.StateNew)
	tracker.ConnState(left, http.StateActive)
	tracker.ConnState(left, http.StateHijacked)

	stats := tracker.ConversationRuntimeStats()
	if stats.CurrentConns != 0 || stats.ActiveConns != 0 || stats.HijackedConns != 1 {
		t.Fatalf("hijacked stats = %#v", stats)
	}
}

type fakeConfigDB struct{}

func (fakeConfigDB) Acquire(context.Context) (postgres.Conn, error) {
	return fakeConfigConn{}, nil
}

type fakeConfigConn struct{}

func (fakeConfigConn) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

func (fakeConfigConn) CopyFrom(context.Context, pgx.Identifier, []string, pgx.CopyFromSource) (int64, error) {
	return 0, nil
}

func (fakeConfigConn) Release() {}
