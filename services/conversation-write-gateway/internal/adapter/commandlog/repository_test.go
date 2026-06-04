package commandlog_test

import (
	"context"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"ita-refactor/services/conversation-write-gateway/internal/adapter/commandlog"
	"ita-refactor/services/conversation-write-gateway/internal/domain"
	"ita-refactor/services/conversation-write-gateway/internal/platform"
	"ita-refactor/services/conversation-write-gateway/internal/usecase"
)

func TestRepositoryReturnsAcceptedAfterDurableAppendBeforeProjectionFinishes(t *testing.T) {
	projection := newBlockingProjection()
	logPath := repositoryLogPath(t)
	repository := newTestRepository(t, projection, commandlog.Config{
		Path:              logPath,
		AppendBatchSize:   1,
		ProjectionWorkers: 1,
		QueueCapacity:     8,
		Sync:              true,
	})
	defer func() {
		projection.release()
		repository.Close()
	}()

	timing := &platform.ConversationTiming{}
	ctx := platform.WithConversationTiming(context.Background(), timing)
	start := time.Now()
	outcome, err := repository.Create(ctx, testConversation("conv_fast"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if elapsed := time.Since(start); elapsed > 100*time.Millisecond {
		t.Fatalf("Create() waited for projection: %s", elapsed)
	}
	if outcome.Status != usecase.PersistenceStatusAccepted {
		t.Fatalf("status = %q want accepted", outcome.Status)
	}
	if outcome.CommandID != "cmd_conv_fast" {
		t.Fatalf("command id = %q", outcome.CommandID)
	}
	if timing.CommandAppend <= 0 {
		t.Fatalf("CommandAppend = %s want > 0", timing.CommandAppend)
	}
	if timing.ProjectionEnqueue <= 0 {
		t.Fatalf("ProjectionEnqueue = %s want > 0", timing.ProjectionEnqueue)
	}

	projection.waitStarted(t)
	stats := repository.ConversationCommandLogStats()
	if stats.AcceptedCommands != 1 || stats.ProjectionEnqueued != 1 {
		t.Fatalf("stats after accept = %#v", stats)
	}
	if stats.QueueDepth != 1 {
		t.Fatalf("QueueDepth = %d want in-flight command", stats.QueueDepth)
	}

	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read command log: %v", err)
	}
	if !strings.Contains(string(data), `"commandId":"cmd_conv_fast"`) {
		t.Fatalf("command log missing command id: %s", string(data))
	}

	projection.release()
	projection.waitDone(t)
	stats = repository.ConversationCommandLogStats()
	if stats.ProjectionSucceeded != 1 || stats.QueueDepth != 0 {
		t.Fatalf("stats after projection = %#v", stats)
	}
}

func TestRepositoryReplaysExistingCommandLog(t *testing.T) {
	logPath := repositoryLogPath(t)
	record := `{"schemaVersion":"2026-06-04.conversation.command-log.v1","commandId":"cmd_conv_replay","type":"create_research_conversation","acceptedAt":"2026-06-04T00:00:00Z","conversation":{"id":"conv_replay","title":"Replay","createdAt":"2026-06-04T00:00:00Z","updatedAt":"2026-06-04T00:00:00Z","messageCount":0,"totalTokens":0,"settings":{"fusionMode":"balanced"}}}` + "\n"
	if err := os.WriteFile(logPath, []byte(record), 0o600); err != nil {
		t.Fatalf("write seed command log: %v", err)
	}
	projection := newRecordingProjection()
	repository, err := commandlog.NewRepository(commandlog.Config{
		Path:              logPath,
		Projection:        projection,
		AppendBatchSize:   1,
		ProjectionWorkers: 1,
		QueueCapacity:     8,
		Sync:              true,
	})
	if err != nil {
		t.Fatalf("NewRepository() error = %v", err)
	}
	defer repository.Close()

	got := projection.waitConversation(t)
	if got.ID != "conv_replay" || got.Title != "Replay" {
		t.Fatalf("replayed conversation = %#v", got)
	}
	if string(got.Settings.JSON()) != `{"fusionMode":"balanced"}` {
		t.Fatalf("settings = %s", got.Settings.JSON())
	}
}

func TestRepositoryCountsProjectionFailures(t *testing.T) {
	repository := newTestRepository(t, failingProjection{err: errors.New("db down")}, commandlog.Config{
		Path:              repositoryLogPath(t),
		AppendBatchSize:   1,
		ProjectionWorkers: 1,
		QueueCapacity:     8,
		Sync:              false,
	})
	defer repository.Close()

	if _, err := repository.Create(context.Background(), testConversation("conv_fail")); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	waitUntil(t, func() bool {
		return repository.ConversationCommandLogStats().ProjectionFailed == 1
	}, "projection failure")
}

func newTestRepository(t *testing.T, projection usecase.ConversationRepository, config commandlog.Config) *commandlog.Repository {
	t.Helper()
	if config.Path == "" {
		config.Path = repositoryLogPath(t)
	}
	config.Projection = projection
	repository, err := commandlog.NewRepository(config)
	if err != nil {
		t.Fatalf("NewRepository() error = %v", err)
	}
	return repository
}

func repositoryLogPath(t *testing.T) string {
	t.Helper()
	return t.TempDir() + "/conversation-commands.jsonl"
}

func testConversation(id string) domain.Conversation {
	now := time.Date(2026, 6, 4, 0, 0, 0, 0, time.UTC)
	return domain.Conversation{
		ID:        id,
		Title:     "Research",
		CreatedAt: now,
		UpdatedAt: now,
		Settings:  domain.NewSettingsJSON([]byte(`{"fusionMode":"balanced"}`)),
	}
}

type blockingProjection struct {
	started     chan struct{}
	releaseC    chan struct{}
	done        chan struct{}
	once        sync.Once
	releaseOnce sync.Once
}

func newBlockingProjection() *blockingProjection {
	return &blockingProjection{
		started:  make(chan struct{}),
		releaseC: make(chan struct{}),
		done:     make(chan struct{}),
	}
}

func (b *blockingProjection) Create(context.Context, domain.Conversation) (usecase.CreatePersistenceOutcome, error) {
	b.once.Do(func() { close(b.started) })
	<-b.releaseC
	close(b.done)
	return usecase.PersistedOutcome(), nil
}

func (b *blockingProjection) waitStarted(t *testing.T) {
	t.Helper()
	select {
	case <-b.started:
	case <-time.After(time.Second):
		t.Fatal("projection did not start")
	}
}

func (b *blockingProjection) release() {
	b.releaseOnce.Do(func() {
		close(b.releaseC)
	})
}

func (b *blockingProjection) waitDone(t *testing.T) {
	t.Helper()
	select {
	case <-b.done:
	case <-time.After(time.Second):
		t.Fatal("projection did not finish")
	}
}

type recordingProjection struct {
	created chan domain.Conversation
}

func newRecordingProjection() *recordingProjection {
	return &recordingProjection{created: make(chan domain.Conversation, 4)}
}

func (r *recordingProjection) Create(_ context.Context, conversation domain.Conversation) (usecase.CreatePersistenceOutcome, error) {
	r.created <- conversation
	return usecase.PersistedOutcome(), nil
}

func (r *recordingProjection) waitConversation(t *testing.T) domain.Conversation {
	t.Helper()
	select {
	case conversation := <-r.created:
		return conversation
	case <-time.After(time.Second):
		t.Fatal("projection did not receive replayed conversation")
	}
	return domain.Conversation{}
}

type failingProjection struct {
	err error
}

func (f failingProjection) Create(context.Context, domain.Conversation) (usecase.CreatePersistenceOutcome, error) {
	return usecase.CreatePersistenceOutcome{}, f.err
}

func waitUntil(t *testing.T, predicate func() bool, label string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if predicate() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", label)
}
