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

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

const schemaVersion = "2026-06-04.teaching.command-log.v1"
const maxAcceptedArchiveItemCacheEntries = 65536

var ErrRepositoryClosed = errors.New("teaching command log repository closed")

type Config struct {
	Path              string
	AppendBatchSize   int
	AppendMaxDelay    time.Duration
	QueueCapacity     int
	ProjectionWorkers int
	Sync              bool
	ArchiveProjection usecase.ArchiveRepository
	QuizProjection    usecase.QuizSubmissionRepository
}

type Repository struct {
	appender          *durableAppender
	archiveProjection usecase.ArchiveRepository
	quizProjection    usecase.QuizSubmissionRepository
	projectionQueue   chan projectionRequest
	projectionMu      sync.RWMutex
	workerWG          sync.WaitGroup
	closeOnce         sync.Once
	closed            atomic.Bool

	acceptedCommands    atomic.Int64
	appendErrors        atomic.Int64
	projectionEnqueued  atomic.Int64
	projectionSucceeded atomic.Int64
	projectionFailed    atomic.Int64

	pendingMu            sync.Mutex
	pending              map[string]time.Time
	acceptedArchiveItems map[string]domain.ArchiveItem
	acceptedArchiveOrder []string
}

type commandRecord struct {
	SchemaVersion              string                             `json:"schemaVersion"`
	CommandID                  string                             `json:"commandId"`
	Type                       string                             `json:"type"`
	AcceptedAt                 time.Time                          `json:"acceptedAt"`
	ArchiveItem                *archiveItemPayload                `json:"archiveItem,omitempty"`
	QuizSubmission             *quizSubmissionPayload             `json:"quizSubmission,omitempty"`
	QuizDraftIntent            *quizDraftIntentPayload            `json:"quizDraftIntent,omitempty"`
	ArchiveMaterialDraftIntent *archiveMaterialDraftIntentPayload `json:"archiveMaterialDraftIntent,omitempty"`
}

type archiveItemPayload struct {
	ID              string                  `json:"id"`
	OwnerType       domain.OwnerType        `json:"ownerType"`
	StudentID       string                  `json:"studentId,omitempty"`
	MaterialType    domain.MaterialType     `json:"materialType"`
	Title           string                  `json:"title"`
	Source          domain.Source           `json:"source"`
	ContentRef      string                  `json:"contentRef"`
	Tags            []string                `json:"tags"`
	AnalysisIntents []domain.AnalysisIntent `json:"analysisIntents"`
	OCRStatus       domain.OCRStatus        `json:"ocrStatus"`
	CreatedAt       time.Time               `json:"createdAt"`
}

type quizSubmissionPayload struct {
	ID                     string                      `json:"id"`
	QuizArchiveItemID      string                      `json:"quizArchiveItemId"`
	StudentID              string                      `json:"studentId"`
	SubmittedByPrincipalID string                      `json:"submittedByPrincipalId"`
	AnswerRef              string                      `json:"answerRef"`
	Status                 domain.QuizSubmissionStatus `json:"status"`
	SubmittedAt            time.Time                   `json:"submittedAt"`
}

type projectionRequest struct {
	commandID      string
	acceptedAt     time.Time
	archiveItem    *domain.ArchiveItem
	quizSubmission *domain.QuizSubmission
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
		appender:             appender,
		archiveProjection:    normalized.ArchiveProjection,
		quizProjection:       normalized.QuizProjection,
		projectionQueue:      make(chan projectionRequest, normalized.QueueCapacity),
		pending:              map[string]time.Time{},
		acceptedArchiveItems: map[string]domain.ArchiveItem{},
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

func (r *Repository) Create(ctx context.Context, item domain.ArchiveItem) (usecase.WritePersistenceOutcome, error) {
	if r.closed.Load() {
		return usecase.WritePersistenceOutcome{}, ErrRepositoryClosed
	}
	commandID := CommandIDForArchiveItem(item.ID)
	acceptedAt := time.Now().UTC()
	record := commandRecord{
		SchemaVersion: schemaVersion,
		CommandID:     commandID,
		Type:          "create_teaching_archive_item",
		AcceptedAt:    acceptedAt,
		ArchiveItem:   archiveItemToPayload(item),
	}
	request := projectionRequest{
		commandID:   commandID,
		acceptedAt:  acceptedAt,
		archiveItem: &item,
	}
	if err := r.accept(ctx, record, request); err != nil {
		return usecase.WritePersistenceOutcome{}, err
	}
	r.rememberAcceptedArchiveItem(item)
	return usecase.AcceptedWriteOutcome(commandID), nil
}

func (r *Repository) GetByID(ctx context.Context, id string) (domain.ArchiveItem, bool, error) {
	if item, ok, err := r.pendingArchiveItem(id); err != nil || ok {
		return item, ok, err
	}
	item, ok, err := r.quizProjection.GetByID(ctx, id)
	if err != nil || ok {
		if ok {
			r.rememberAcceptedArchiveItem(item)
		}
		return item, ok, err
	}
	return domain.ArchiveItem{}, false, nil
}

func (r *Repository) CreateQuizSubmission(
	ctx context.Context,
	submission domain.QuizSubmission,
) (usecase.WritePersistenceOutcome, error) {
	return r.acceptQuizSubmission(ctx, submission)
}

func (r *Repository) CreateQuizSubmissionForExistingTeachingQuiz(
	ctx context.Context,
	submission domain.QuizSubmission,
) (bool, usecase.WritePersistenceOutcome, error) {
	item, ok, err := r.GetByID(ctx, submission.QuizArchiveItemID)
	if err != nil || !ok {
		return false, usecase.WritePersistenceOutcome{}, err
	}
	if item.OwnerType != domain.OwnerTypeTeaching || item.MaterialType != domain.MaterialTypeQuiz {
		return false, usecase.WritePersistenceOutcome{}, nil
	}
	outcome, err := r.acceptQuizSubmission(ctx, submission)
	if err != nil {
		return false, usecase.WritePersistenceOutcome{}, err
	}
	return true, outcome, nil
}

func (r *Repository) Close() {
	r.closeOnce.Do(func() {
		r.closed.Store(true)
		r.appender.Close()
		r.projectionMu.Lock()
		close(r.projectionQueue)
		r.projectionMu.Unlock()
		r.workerWG.Wait()
		if closer, ok := r.archiveProjection.(interface{ Close() }); ok {
			closer.Close()
		}
		if closer, ok := r.quizProjection.(interface{ Close() }); ok {
			closer.Close()
		}
	})
}

func (r *Repository) TeachingCommandLogStats() platform.TeachingCommandLogStats {
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
	return platform.TeachingCommandLogStats{
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

func CommandIDForArchiveItem(archiveItemID string) string {
	return "cmd_" + archiveItemID
}

func CommandIDForQuizSubmission(submissionID string) string {
	return "cmd_" + submissionID
}

func normalizeConfig(config Config) (Config, error) {
	if config.Path == "" {
		return Config{}, errors.New("command log path is required")
	}
	if config.ArchiveProjection == nil {
		return Config{}, errors.New("archive projection repository is required")
	}
	if config.QuizProjection == nil {
		return Config{}, errors.New("quiz projection repository is required")
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

func (r *Repository) accept(ctx context.Context, record commandRecord, request projectionRequest) error {
	appendStart := time.Now()
	if err := r.appender.Append(ctx, record); err != nil {
		r.appendErrors.Add(1)
		recordCommandAppendTiming(ctx, time.Since(appendStart))
		return err
	}
	recordCommandAppendTiming(ctx, time.Since(appendStart))

	enqueueStart := time.Now()
	if err := r.enqueueProjection(ctx, request); err != nil {
		return err
	}
	recordProjectionEnqueueTiming(ctx, time.Since(enqueueStart))
	r.acceptedCommands.Add(1)
	return nil
}

func (r *Repository) acceptQuizSubmission(
	ctx context.Context,
	submission domain.QuizSubmission,
) (usecase.WritePersistenceOutcome, error) {
	if r.closed.Load() {
		return usecase.WritePersistenceOutcome{}, ErrRepositoryClosed
	}
	commandID := CommandIDForQuizSubmission(submission.ID)
	acceptedAt := time.Now().UTC()
	record := commandRecord{
		SchemaVersion:  schemaVersion,
		CommandID:      commandID,
		Type:           "create_teaching_quiz_submission",
		AcceptedAt:     acceptedAt,
		QuizSubmission: quizSubmissionToPayload(submission),
	}
	request := projectionRequest{
		commandID:      commandID,
		acceptedAt:     acceptedAt,
		quizSubmission: &submission,
	}
	if err := r.accept(ctx, record, request); err != nil {
		return usecase.WritePersistenceOutcome{}, err
	}
	return usecase.AcceptedWriteOutcome(commandID), nil
}

func (r *Repository) replayExistingCommands(path string) error {
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("open teaching command log for replay: %w", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		var record commandRecord
		if err := json.Unmarshal(scanner.Bytes(), &record); err != nil {
			return fmt.Errorf("decode teaching command log record: %w", err)
		}
		request, ok := projectionRequestFromRecord(record)
		if !ok {
			continue
		}
		if request.archiveItem != nil {
			r.rememberAcceptedArchiveItem(*request.archiveItem)
		}
		if err := r.enqueueProjection(context.Background(), request); err != nil {
			return err
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scan teaching command log: %w", err)
	}
	return nil
}

func projectionRequestFromRecord(record commandRecord) (projectionRequest, bool) {
	request := projectionRequest{
		commandID:  record.CommandID,
		acceptedAt: record.AcceptedAt,
	}
	if record.ArchiveItem != nil {
		item := payloadToArchiveItem(*record.ArchiveItem)
		request.archiveItem = &item
		return request, true
	}
	if record.QuizSubmission != nil {
		submission := payloadToQuizSubmission(*record.QuizSubmission)
		request.quizSubmission = &submission
		return request, true
	}
	return projectionRequest{}, false
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
			if request.archiveItem != nil {
				_, err := r.archiveProjection.Create(context.Background(), *request.archiveItem)
				return err
			}
			if request.quizSubmission != nil {
				_, err := r.quizProjection.CreateQuizSubmission(context.Background(), *request.quizSubmission)
				return err
			}
			return nil
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
	for attempt := 0; attempt < 10; attempt++ {
		if err := operation(); err != nil {
			lastErr = err
		} else {
			return nil
		}
		time.Sleep(time.Duration(attempt+1) * 10 * time.Millisecond)
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

func (r *Repository) rememberAcceptedArchiveItem(item domain.ArchiveItem) {
	r.pendingMu.Lock()
	defer r.pendingMu.Unlock()
	if _, exists := r.acceptedArchiveItems[item.ID]; !exists {
		r.acceptedArchiveOrder = append(r.acceptedArchiveOrder, item.ID)
	}
	r.acceptedArchiveItems[item.ID] = item
	for len(r.acceptedArchiveOrder) > maxAcceptedArchiveItemCacheEntries {
		oldestID := r.acceptedArchiveOrder[0]
		r.acceptedArchiveOrder = r.acceptedArchiveOrder[1:]
		delete(r.acceptedArchiveItems, oldestID)
	}
}

func (r *Repository) pendingArchiveItem(id string) (domain.ArchiveItem, bool, error) {
	r.pendingMu.Lock()
	defer r.pendingMu.Unlock()
	item, ok := r.acceptedArchiveItems[id]
	return item, ok, nil
}

func archiveItemToPayload(item domain.ArchiveItem) *archiveItemPayload {
	return &archiveItemPayload{
		ID:              item.ID,
		OwnerType:       item.OwnerType,
		StudentID:       item.StudentID,
		MaterialType:    item.MaterialType,
		Title:           item.Title,
		Source:          item.Source,
		ContentRef:      item.ContentRef,
		Tags:            item.Tags,
		AnalysisIntents: item.AnalysisIntents,
		OCRStatus:       item.OCRStatus,
		CreatedAt:       item.CreatedAt,
	}
}

func payloadToArchiveItem(payload archiveItemPayload) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              payload.ID,
		OwnerType:       payload.OwnerType,
		StudentID:       payload.StudentID,
		MaterialType:    payload.MaterialType,
		Title:           payload.Title,
		Source:          payload.Source,
		ContentRef:      payload.ContentRef,
		Tags:            payload.Tags,
		AnalysisIntents: payload.AnalysisIntents,
		OCRStatus:       payload.OCRStatus,
		CreatedAt:       payload.CreatedAt,
	}
}

func quizSubmissionToPayload(submission domain.QuizSubmission) *quizSubmissionPayload {
	return &quizSubmissionPayload{
		ID:                     submission.ID,
		QuizArchiveItemID:      submission.QuizArchiveItemID,
		StudentID:              submission.StudentID,
		SubmittedByPrincipalID: submission.SubmittedByPrincipalID,
		AnswerRef:              submission.AnswerRef,
		Status:                 submission.Status,
		SubmittedAt:            submission.SubmittedAt,
	}
}

func payloadToQuizSubmission(payload quizSubmissionPayload) domain.QuizSubmission {
	return domain.QuizSubmission{
		ID:                     payload.ID,
		QuizArchiveItemID:      payload.QuizArchiveItemID,
		StudentID:              payload.StudentID,
		SubmittedByPrincipalID: payload.SubmittedByPrincipalID,
		AnswerRef:              payload.AnswerRef,
		Status:                 payload.Status,
		SubmittedAt:            payload.SubmittedAt,
	}
}

func recordCommandAppendTiming(ctx context.Context, duration time.Duration) {
	if timing := platform.TeachingArchiveTimingFromContext(ctx); timing != nil {
		timing.CommandAppend = observableDuration(duration)
	}
}

func recordProjectionEnqueueTiming(ctx context.Context, duration time.Duration) {
	if timing := platform.TeachingArchiveTimingFromContext(ctx); timing != nil {
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
		return nil, fmt.Errorf("create teaching command log directory: %w", err)
	}
	file, err := os.OpenFile(config.Path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open teaching command log: %w", err)
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
