package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

type ArchiveCreateBatchMode string

const (
	ArchiveCreateBatchModeInsert ArchiveCreateBatchMode = "insert"
	ArchiveCreateBatchModeCopy   ArchiveCreateBatchMode = "copy"
)

type ArchiveCreateBatchConfig struct {
	MaxSize  int
	MaxDelay time.Duration
	Workers  int
	Mode     ArchiveCreateBatchMode
}

var ErrArchiveRepositoryClosed = errors.New("archive repository closed")

type BatchingArchiveItemRepository struct {
	db        AcquireDB
	maxSize   int
	maxDelay  time.Duration
	workers   int
	mode      ArchiveCreateBatchMode
	requests  chan archiveCreateRequest
	closing   chan struct{}
	done      chan struct{}
	workerWG  sync.WaitGroup
	closeOnce sync.Once
	enqueueMu sync.RWMutex
	enqueueWG sync.WaitGroup
	closed    bool
}

type archiveCreateRequest struct {
	ctx        context.Context
	item       domain.ArchiveItem
	enqueuedAt time.Time
	result     chan error
}

func NewBatchingArchiveItemRepository(db AcquireDB, config ArchiveCreateBatchConfig) *BatchingArchiveItemRepository {
	maxSize := config.MaxSize
	if maxSize < 2 {
		maxSize = 2
	}
	workers := config.Workers
	if workers < 1 {
		workers = 1
	}
	repository := &BatchingArchiveItemRepository{
		db:       db,
		maxSize:  maxSize,
		maxDelay: config.MaxDelay,
		workers:  workers,
		mode:     normalizeArchiveCreateBatchMode(config.Mode),
		requests: make(chan archiveCreateRequest, maxSize*workers*4),
		closing:  make(chan struct{}),
		done:     make(chan struct{}),
	}
	for index := 0; index < workers; index++ {
		repository.workerWG.Add(1)
		go repository.run()
	}
	return repository
}

func (r *BatchingArchiveItemRepository) WorkerCount() int {
	return r.workers
}

func (r *BatchingArchiveItemRepository) WriteMode() ArchiveCreateBatchMode {
	return r.mode
}

func (r *BatchingArchiveItemRepository) Create(ctx context.Context, item domain.ArchiveItem) (usecase.WritePersistenceOutcome, error) {
	request := archiveCreateRequest{
		ctx:        ctx,
		item:       item,
		enqueuedAt: time.Now(),
		result:     make(chan error, 1),
	}

	r.enqueueMu.RLock()
	if r.closed {
		r.enqueueMu.RUnlock()
		return usecase.WritePersistenceOutcome{}, ErrArchiveRepositoryClosed
	}
	r.enqueueWG.Add(1)
	r.enqueueMu.RUnlock()
	select {
	case r.requests <- request:
		r.enqueueWG.Done()
	case <-ctx.Done():
		r.enqueueWG.Done()
		return usecase.WritePersistenceOutcome{}, ctx.Err()
	case <-r.closing:
		r.enqueueWG.Done()
		return usecase.WritePersistenceOutcome{}, ErrArchiveRepositoryClosed
	}

	if err := <-request.result; err != nil {
		return usecase.WritePersistenceOutcome{}, err
	}
	return usecase.PersistedWriteOutcome(), nil
}

func (r *BatchingArchiveItemRepository) Close() {
	r.closeOnce.Do(func() {
		r.enqueueMu.Lock()
		r.closed = true
		close(r.closing)
		r.enqueueMu.Unlock()
		r.enqueueWG.Wait()
		close(r.requests)
		r.workerWG.Wait()
		close(r.done)
		<-r.done
	})
}

func (r *BatchingArchiveItemRepository) run() {
	defer r.workerWG.Done()
	for first := range r.requests {
		batch := []archiveCreateRequest{first}
		r.collectBatch(&batch)
		r.flush(batch)
	}
}

func (r *BatchingArchiveItemRepository) collectBatch(batch *[]archiveCreateRequest) {
	if len(*batch) >= r.maxSize {
		return
	}
	if r.maxDelay <= 0 {
		r.collectReadyRequests(batch)
		return
	}

	timer := time.NewTimer(r.maxDelay)
	defer timer.Stop()
	for len(*batch) < r.maxSize {
		select {
		case request, ok := <-r.requests:
			if !ok {
				return
			}
			*batch = append(*batch, request)
		case <-timer.C:
			return
		}
	}
}

func (r *BatchingArchiveItemRepository) collectReadyRequests(batch *[]archiveCreateRequest) {
	for len(*batch) < r.maxSize {
		select {
		case request, ok := <-r.requests:
			if !ok {
				return
			}
			*batch = append(*batch, request)
		default:
			return
		}
	}
}

func (r *BatchingArchiveItemRepository) flush(batch []archiveCreateRequest) {
	flushStart := time.Now()
	active := make([]archiveCreateRequest, 0, len(batch))
	for _, request := range batch {
		if err := request.ctx.Err(); err != nil {
			request.result <- err
			continue
		}
		recordDBBatchWaitTiming(request.ctx, observableDuration(flushStart.Sub(request.enqueuedAt)))
		active = append(active, request)
	}
	if len(active) == 0 {
		return
	}

	acquireStart := time.Now()
	conn, err := r.db.Acquire(context.Background())
	acquireDuration := observableDuration(time.Since(acquireStart))
	for _, request := range active {
		recordDBAcquireTiming(request.ctx, acquireDuration)
	}
	if err != nil {
		completeArchiveCreateBatch(active, err)
		return
	}
	defer conn.Release()

	insertStart := time.Now()
	if r.mode == ArchiveCreateBatchModeCopy {
		err = copyArchiveItems(context.Background(), conn, active)
	} else {
		var statement string
		var args []any
		statement, args, err = buildInsertArchiveItemsStatement(active)
		if err == nil {
			_, err = conn.Exec(context.Background(), statement, args...)
		}
	}
	insertDuration := observableDuration(time.Since(insertStart))
	for _, request := range active {
		recordDBExecTiming(request.ctx, insertDuration)
		recordDBInsertTiming(request.ctx, insertDuration)
	}
	completeArchiveCreateBatch(active, err)
}

func completeArchiveCreateBatch(batch []archiveCreateRequest, err error) {
	for _, request := range batch {
		request.result <- err
	}
}

func normalizeArchiveCreateBatchMode(mode ArchiveCreateBatchMode) ArchiveCreateBatchMode {
	if mode == ArchiveCreateBatchModeCopy {
		return ArchiveCreateBatchModeCopy
	}
	return ArchiveCreateBatchModeInsert
}

var archiveItemCopyColumns = []string{
	"id",
	"owner_type",
	"student_id",
	"material_type",
	"title",
	"source",
	"content_ref",
	"tags",
	"analysis_intents",
	"ocr_status",
	"created_at",
}

func copyArchiveItems(ctx context.Context, conn Conn, batch []archiveCreateRequest) error {
	_, err := conn.CopyFrom(
		ctx,
		pgx.Identifier{"teaching_archive_items"},
		archiveItemCopyColumns,
		pgx.CopyFromSlice(len(batch), func(index int) ([]any, error) {
			return archiveItemCopyRow(batch[index].item)
		}),
	)
	return err
}

func archiveItemCopyRow(item domain.ArchiveItem) ([]any, error) {
	tags, err := json.Marshal(item.Tags)
	if err != nil {
		return nil, err
	}
	intents, err := json.Marshal(item.AnalysisIntents)
	if err != nil {
		return nil, err
	}
	var studentID any
	if item.StudentID != "" {
		studentID = item.StudentID
	}
	return []any{
		item.ID,
		item.OwnerType,
		studentID,
		item.MaterialType,
		item.Title,
		item.Source,
		item.ContentRef,
		string(tags),
		string(intents),
		item.OCRStatus,
		item.CreatedAt,
	}, nil
}

func buildInsertArchiveItemsStatement(batch []archiveCreateRequest) (string, []any, error) {
	var builder strings.Builder
	builder.WriteString(`
		INSERT INTO teaching_archive_items (
			id,
			owner_type,
			student_id,
			material_type,
			title,
			source,
			content_ref,
			tags,
			analysis_intents,
			ocr_status,
			created_at
		) VALUES `)

	args := make([]any, 0, len(batch)*11)
	for index, request := range batch {
		tags, err := json.Marshal(request.item.Tags)
		if err != nil {
			return "", nil, err
		}
		intents, err := json.Marshal(request.item.AnalysisIntents)
		if err != nil {
			return "", nil, err
		}

		if index > 0 {
			builder.WriteString(", ")
		}
		offset := index * 11
		builder.WriteString(fmt.Sprintf(
			"($%d, $%d, NULLIF($%d, ''), $%d, $%d, $%d, $%d, $%d::jsonb, $%d::jsonb, $%d, $%d)",
			offset+1,
			offset+2,
			offset+3,
			offset+4,
			offset+5,
			offset+6,
			offset+7,
			offset+8,
			offset+9,
			offset+10,
			offset+11,
		))

		item := request.item
		args = append(args,
			item.ID,
			item.OwnerType,
			item.StudentID,
			item.MaterialType,
			item.Title,
			item.Source,
			item.ContentRef,
			tags,
			intents,
			item.OCRStatus,
			item.CreatedAt,
		)
	}
	return builder.String(), args, nil
}
