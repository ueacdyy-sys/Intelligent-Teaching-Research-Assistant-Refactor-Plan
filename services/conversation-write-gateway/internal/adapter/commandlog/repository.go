package commandlog

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"ita-refactor/services/conversation-write-gateway/internal/domain"
	"ita-refactor/services/conversation-write-gateway/internal/platform"
	"ita-refactor/services/conversation-write-gateway/internal/usecase"
)

const schemaVersion = "2026-06-04.conversation.command-log.v1"

var ErrRepositoryClosed = errors.New("conversation command log repository closed")

type Config struct {
	Path              string
	AppendBatchSize   int
	AppendMaxDelay    time.Duration
	QueueCapacity     int
	ProjectionWorkers int
	Sync              bool
	Projection        usecase.ConversationRepository
}

type Repository struct {
	appender        *durableAppender
	projection      usecase.ConversationRepository
	projectionQueue chan projectionRequest
	projectionMu    sync.RWMutex
	workerWG        sync.WaitGroup
	closeOnce       sync.Once
	closed          atomic.Bool

	acceptedCommands    atomic.Int64
	appendErrors        atomic.Int64
	projectionEnqueued  atomic.Int64
	projectionSucceeded atomic.Int64
	projectionFailed    atomic.Int64

	pendingMu sync.Mutex
	pending   map[string]time.Time
}

type commandRecord struct {
	SchemaVersion string              `json:"schemaVersion"`
	CommandID     string              `json:"commandId"`
	Type          string              `json:"type"`
	AcceptedAt    time.Time           `json:"acceptedAt"`
	Conversation  conversationPayload `json:"conversation"`
}

type conversationPayload struct {
	ID           string          `json:"id"`
	Title        string          `json:"title"`
	CreatedAt    time.Time       `json:"createdAt"`
	UpdatedAt    time.Time       `json:"updatedAt"`
	MessageCount int             `json:"messageCount"`
	TotalTokens  int             `json:"totalTokens"`
	Settings     json.RawMessage `json:"settings,omitempty"`
}

type projectionRequest struct {
	commandID    string
	acceptedAt   time.Time
	conversation domain.Conversation
}

func NewRepository(config Config) (*Repository, error) {
	normalized, err := normalizeConfig(config)
	if err != nil {
		return nil, err
	}
	appender, err := newDurableAppender(durableAppenderConfig{
		Path:      normalized.Path,
		BatchSize: normalized.AppendBatchSize,
		MaxDelay:  normalized.AppendMaxDelay,
		Sync:      normalized.Sync,
	})
	if err != nil {
		return nil, err
	}
	repository := &Repository{
		appender:        appender,
		projection:      normalized.Projection,
		projectionQueue: make(chan projectionRequest, normalized.QueueCapacity),
		pending:         map[string]time.Time{},
	}
	for index := 0; index < normalized.ProjectionWorkers; index++ {
		repository.workerWG.Add(1)
		go repository.runProjectionWorker()
	}
	if err := repository.replayExistingCommands(normalized.Path); err != nil {
		repository.Close()
		return nil, err
	}
	return repository, nil
}

func (r *Repository) Create(ctx context.Context, conversation domain.Conversation) (usecase.CreatePersistenceOutcome, error) {
	if r.closed.Load() {
		return usecase.CreatePersistenceOutcome{}, ErrRepositoryClosed
	}
	commandID := CommandIDForConversation(conversation.ID)
	acceptedAt := time.Now().UTC()
	record := commandRecord{
		SchemaVersion: schemaVersion,
		CommandID:     commandID,
		Type:          "create_research_conversation",
		AcceptedAt:    acceptedAt,
		Conversation:  conversationToPayload(conversation),
	}
	appendStart := time.Now()
	if err := r.appender.Append(ctx, record); err != nil {
		r.appendErrors.Add(1)
		recordCommandAppendTiming(ctx, time.Since(appendStart))
		return usecase.CreatePersistenceOutcome{}, err
	}
	recordCommandAppendTiming(ctx, time.Since(appendStart))

	enqueueStart := time.Now()
	if err := r.enqueueProjection(ctx, projectionRequest{
		commandID:    commandID,
		acceptedAt:   acceptedAt,
		conversation: conversation,
	}); err != nil {
		return usecase.CreatePersistenceOutcome{}, err
	}
	recordProjectionEnqueueTiming(ctx, time.Since(enqueueStart))
	r.acceptedCommands.Add(1)
	return usecase.AcceptedOutcome(commandID), nil
}

func (r *Repository) Close() {
	r.closeOnce.Do(func() {
		r.closed.Store(true)
		r.appender.Close()
		r.projectionMu.Lock()
		close(r.projectionQueue)
		r.projectionMu.Unlock()
		r.workerWG.Wait()
		if closer, ok := r.projection.(interface{ Close() }); ok {
			closer.Close()
		}
	})
}

func (r *Repository) ConversationCommandLogStats() platform.ConversationCommandLogStats {
	oldestPendingAgeMs := 0.0
	r.pendingMu.Lock()
	for _, acceptedAt := range r.pending {
		ageMs := float64(time.Since(acceptedAt).Microseconds()) / 1000
		if oldestPendingAgeMs == 0 || ageMs > oldestPendingAgeMs {
			oldestPendingAgeMs = ageMs
		}
	}
	pendingCount := len(r.pending)
	r.pendingMu.Unlock()
	return platform.ConversationCommandLogStats{
		AcceptedCommands:    r.acceptedCommands.Load(),
		AppendErrors:        r.appendErrors.Load(),
		ProjectionEnqueued:  r.projectionEnqueued.Load(),
		ProjectionSucceeded: r.projectionSucceeded.Load(),
		ProjectionFailed:    r.projectionFailed.Load(),
		QueueDepth:          pendingCount,
		QueueCapacity:       cap(r.projectionQueue),
		OldestPendingAgeMs:  oldestPendingAgeMs,
	}
}

func CommandIDForConversation(conversationID string) string {
	return "cmd_" + conversationID
}

func normalizeConfig(config Config) (Config, error) {
	if config.Path == "" {
		return Config{}, errors.New("command log path is required")
	}
	if config.Projection == nil {
		return Config{}, errors.New("projection repository is required")
	}
	if config.AppendBatchSize < 1 {
		config.AppendBatchSize = 1
	}
	if config.QueueCapacity < 1 {
		config.QueueCapacity = 1024
	}
	if config.ProjectionWorkers < 1 {
		config.ProjectionWorkers = 1
	}
	return config, nil
}

func (r *Repository) replayExistingCommands(path string) error {
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("open command log for replay: %w", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		var record commandRecord
		if err := json.Unmarshal(scanner.Bytes(), &record); err != nil {
			return fmt.Errorf("decode command log record: %w", err)
		}
		request := projectionRequest{
			commandID:    record.CommandID,
			acceptedAt:   record.AcceptedAt,
			conversation: payloadToConversation(record.Conversation),
		}
		if err := r.enqueueProjection(context.Background(), request); err != nil {
			return err
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scan command log: %w", err)
	}
	return nil
}

func (r *Repository) enqueueProjection(ctx context.Context, request projectionRequest) error {
	r.projectionMu.RLock()
	defer r.projectionMu.RUnlock()
	if r.closed.Load() {
		return ErrRepositoryClosed
	}
	r.markPending(request)
	select {
	case r.projectionQueue <- request:
		r.projectionEnqueued.Add(1)
		return nil
	case <-ctx.Done():
		r.clearPending(request.commandID)
		return ctx.Err()
	}
}

func (r *Repository) runProjectionWorker() {
	defer r.workerWG.Done()
	for request := range r.projectionQueue {
		err := retryProjection(func() error {
			_, err := r.projection.Create(context.Background(), request.conversation)
			return err
		})
		r.clearPending(request.commandID)
		if err != nil {
			r.projectionFailed.Add(1)
			continue
		}
		r.projectionSucceeded.Add(1)
	}
}

func retryProjection(operation func() error) error {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if err := operation(); err != nil {
			lastErr = err
		} else {
			return nil
		}
		time.Sleep(time.Duration(attempt+1) * 25 * time.Millisecond)
	}
	return lastErr
}

func (r *Repository) markPending(request projectionRequest) {
	r.pendingMu.Lock()
	defer r.pendingMu.Unlock()
	r.pending[request.commandID] = request.acceptedAt
}

func (r *Repository) clearPending(commandID string) {
	r.pendingMu.Lock()
	defer r.pendingMu.Unlock()
	delete(r.pending, commandID)
}

func conversationToPayload(conversation domain.Conversation) conversationPayload {
	return conversationPayload{
		ID:           conversation.ID,
		Title:        conversation.Title,
		CreatedAt:    conversation.CreatedAt,
		UpdatedAt:    conversation.UpdatedAt,
		MessageCount: conversation.MessageCount,
		TotalTokens:  conversation.TotalTokens,
		Settings:     conversation.Settings.JSON(),
	}
}

func payloadToConversation(payload conversationPayload) domain.Conversation {
	return domain.Conversation{
		ID:           payload.ID,
		Title:        payload.Title,
		CreatedAt:    payload.CreatedAt,
		UpdatedAt:    payload.UpdatedAt,
		MessageCount: payload.MessageCount,
		TotalTokens:  payload.TotalTokens,
		Settings:     domain.NewSettingsJSON(payload.Settings),
	}
}

func recordCommandAppendTiming(ctx context.Context, duration time.Duration) {
	if timing := platform.ConversationTimingFromContext(ctx); timing != nil {
		timing.CommandAppend = observableDuration(duration)
	}
}

func recordProjectionEnqueueTiming(ctx context.Context, duration time.Duration) {
	if timing := platform.ConversationTimingFromContext(ctx); timing != nil {
		timing.ProjectionEnqueue = observableDuration(duration)
	}
}

func observableDuration(duration time.Duration) time.Duration {
	if duration <= 0 {
		return time.Nanosecond
	}
	return duration
}

type durableAppenderConfig struct {
	Path      string
	BatchSize int
	MaxDelay  time.Duration
	Sync      bool
}

type durableAppender struct {
	file      *os.File
	batchSize int
	maxDelay  time.Duration
	sync      bool
	requests  chan appendRequest
	closing   chan struct{}
	workerWG  sync.WaitGroup
	closeOnce sync.Once
	enqueueMu sync.RWMutex
	enqueueWG sync.WaitGroup
	closed    bool
}

type appendRequest struct {
	data   []byte
	result chan error
}

func newDurableAppender(config durableAppenderConfig) (*durableAppender, error) {
	if err := os.MkdirAll(filepath.Dir(config.Path), 0o755); err != nil {
		return nil, fmt.Errorf("create command log directory: %w", err)
	}
	file, err := os.OpenFile(config.Path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open command log: %w", err)
	}
	appender := &durableAppender{
		file:      file,
		batchSize: config.BatchSize,
		maxDelay:  config.MaxDelay,
		sync:      config.Sync,
		requests:  make(chan appendRequest, config.BatchSize*16),
		closing:   make(chan struct{}),
	}
	appender.workerWG.Add(1)
	go appender.run()
	return appender, nil
}

func (a *durableAppender) Append(ctx context.Context, record commandRecord) error {
	data, err := json.Marshal(record)
	if err != nil {
		return err
	}
	data = append(data, '\n')
	request := appendRequest{data: data, result: make(chan error, 1)}

	a.enqueueMu.RLock()
	if a.closed {
		a.enqueueMu.RUnlock()
		return ErrRepositoryClosed
	}
	a.enqueueWG.Add(1)
	a.enqueueMu.RUnlock()
	select {
	case a.requests <- request:
		a.enqueueWG.Done()
	case <-ctx.Done():
		a.enqueueWG.Done()
		return ctx.Err()
	case <-a.closing:
		a.enqueueWG.Done()
		return ErrRepositoryClosed
	}
	return <-request.result
}

func (a *durableAppender) Close() {
	a.closeOnce.Do(func() {
		a.enqueueMu.Lock()
		a.closed = true
		close(a.closing)
		a.enqueueMu.Unlock()
		a.enqueueWG.Wait()
		close(a.requests)
		a.workerWG.Wait()
		_ = a.file.Close()
	})
}

func (a *durableAppender) run() {
	defer a.workerWG.Done()
	for first := range a.requests {
		batch := []appendRequest{first}
		a.collectBatch(&batch)
		a.flush(batch)
	}
}

func (a *durableAppender) collectBatch(batch *[]appendRequest) {
	if len(*batch) >= a.batchSize {
		return
	}
	if a.maxDelay <= 0 {
		for len(*batch) < a.batchSize {
			select {
			case request, ok := <-a.requests:
				if !ok {
					return
				}
				*batch = append(*batch, request)
			default:
				return
			}
		}
		return
	}
	timer := time.NewTimer(a.maxDelay)
	defer timer.Stop()
	for len(*batch) < a.batchSize {
		select {
		case request, ok := <-a.requests:
			if !ok {
				return
			}
			*batch = append(*batch, request)
		case <-timer.C:
			return
		}
	}
}

func (a *durableAppender) flush(batch []appendRequest) {
	var err error
	for _, request := range batch {
		if _, writeErr := a.file.Write(request.data); err == nil && writeErr != nil {
			err = writeErr
		}
	}
	if err == nil && a.sync {
		err = a.file.Sync()
	}
	for _, request := range batch {
		request.result <- err
	}
}
