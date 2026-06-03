package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"ita-refactor/services/conversation-write-gateway/internal/domain"
)

type BatchWriteMode string

const (
	BatchWriteModeInsert BatchWriteMode = "insert"
	BatchWriteModeCopy   BatchWriteMode = "copy"
)

type BatchConfig struct {
	MaxSize  int
	MaxDelay time.Duration
	Workers  int
	Mode     BatchWriteMode
}

var ErrConversationRepositoryClosed = errors.New("conversation repository closed")

type BatchingConversationRepository struct {
	db        DB
	maxSize   int
	maxDelay  time.Duration
	workers   int
	mode      BatchWriteMode
	requests  chan batchCreateRequest
	closing   chan struct{}
	done      chan struct{}
	workerWG  sync.WaitGroup
	closeOnce sync.Once
	enqueueMu sync.RWMutex
	enqueueWG sync.WaitGroup
	closed    bool
}

type batchCreateRequest struct {
	ctx          context.Context
	conversation domain.Conversation
	enqueuedAt   time.Time
	result       chan error
}

func NewBatchingConversationRepository(db DB, config BatchConfig) *BatchingConversationRepository {
	maxSize := config.MaxSize
	if maxSize < 2 {
		maxSize = 2
	}
	workers := config.Workers
	if workers < 1 {
		workers = 1
	}
	repository := &BatchingConversationRepository{
		db:       db,
		maxSize:  maxSize,
		maxDelay: config.MaxDelay,
		workers:  workers,
		mode:     normalizeBatchWriteMode(config.Mode),
		requests: make(chan batchCreateRequest, maxSize*workers*4),
		closing:  make(chan struct{}),
		done:     make(chan struct{}),
	}
	for index := 0; index < workers; index++ {
		repository.workerWG.Add(1)
		go repository.run()
	}
	return repository
}

func (r *BatchingConversationRepository) WorkerCount() int {
	return r.workers
}

func (r *BatchingConversationRepository) WriteMode() BatchWriteMode {
	return r.mode
}

func (r *BatchingConversationRepository) Create(ctx context.Context, conversation domain.Conversation) error {
	request := batchCreateRequest{
		ctx:          ctx,
		conversation: conversation,
		enqueuedAt:   time.Now(),
		result:       make(chan error, 1),
	}

	r.enqueueMu.RLock()
	if r.closed {
		r.enqueueMu.RUnlock()
		return ErrConversationRepositoryClosed
	}
	r.enqueueWG.Add(1)
	r.enqueueMu.RUnlock()
	select {
	case r.requests <- request:
		r.enqueueWG.Done()
	case <-ctx.Done():
		r.enqueueWG.Done()
		return ctx.Err()
	case <-r.closing:
		r.enqueueWG.Done()
		return ErrConversationRepositoryClosed
	}

	// After enqueue, wait for the batch result so a caller cannot observe
	// cancellation while the accepted row is later persisted.
	return <-request.result
}

func (r *BatchingConversationRepository) Close() {
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

func (r *BatchingConversationRepository) run() {
	defer r.workerWG.Done()
	for first := range r.requests {
		batch := []batchCreateRequest{first}
		r.collectBatch(&batch)
		r.flush(batch)
	}
}

func (r *BatchingConversationRepository) collectBatch(batch *[]batchCreateRequest) {
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

func (r *BatchingConversationRepository) collectReadyRequests(batch *[]batchCreateRequest) {
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

func (r *BatchingConversationRepository) flush(batch []batchCreateRequest) {
	flushStart := time.Now()
	active := make([]batchCreateRequest, 0, len(batch))
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
		completeBatch(active, err)
		return
	}
	defer conn.Release()

	insertStart := time.Now()
	if r.mode == BatchWriteModeCopy {
		err = copyConversations(context.Background(), conn, active)
	} else {
		statement, args := buildInsertConversationsStatement(active)
		_, err = conn.Exec(context.Background(), statement, args...)
	}
	insertDuration := observableDuration(time.Since(insertStart))
	for _, request := range active {
		recordDBInsertTiming(request.ctx, insertDuration)
	}
	completeBatch(active, err)
}

func observableDuration(duration time.Duration) time.Duration {
	if duration <= 0 {
		return time.Nanosecond
	}
	return duration
}

func completeBatch(batch []batchCreateRequest, err error) {
	for _, request := range batch {
		request.result <- err
	}
}

func normalizeBatchWriteMode(mode BatchWriteMode) BatchWriteMode {
	if mode == BatchWriteModeCopy {
		return BatchWriteModeCopy
	}
	return BatchWriteModeInsert
}

var conversationCopyColumns = []string{
	"id",
	"title",
	"created_at",
	"updated_at",
	"message_count",
	"total_tokens",
	"settings",
}

func copyConversations(ctx context.Context, conn Conn, batch []batchCreateRequest) error {
	_, err := conn.CopyFrom(
		ctx,
		pgx.Identifier{"research_conversations"},
		conversationCopyColumns,
		pgx.CopyFromSlice(len(batch), func(index int) ([]any, error) {
			return conversationCopyRow(batch[index].conversation), nil
		}),
	)
	return err
}

func conversationCopyRow(conversation domain.Conversation) []any {
	return []any{
		conversation.ID,
		conversation.Title,
		conversation.CreatedAt,
		conversation.UpdatedAt,
		conversation.MessageCount,
		conversation.TotalTokens,
		conversationSettingsValue(conversation),
	}
}

func buildInsertConversationsStatement(batch []batchCreateRequest) (string, []any) {
	var builder strings.Builder
	builder.WriteString(`
		INSERT INTO research_conversations
			(id, title, created_at, updated_at, message_count, total_tokens, settings)
		VALUES `)

	args := make([]any, 0, len(batch)*7)
	for index, request := range batch {
		if index > 0 {
			builder.WriteString(", ")
		}
		offset := index * 7
		builder.WriteString(fmt.Sprintf(
			"($%d, $%d, $%d, $%d, $%d, $%d, $%d::jsonb)",
			offset+1,
			offset+2,
			offset+3,
			offset+4,
			offset+5,
			offset+6,
			offset+7,
		))

		conversation := request.conversation
		args = append(args,
			conversation.ID,
			conversation.Title,
			conversation.CreatedAt,
			conversation.UpdatedAt,
			conversation.MessageCount,
			conversation.TotalTokens,
			conversationSettingsValue(conversation),
		)
	}
	return builder.String(), args
}

func conversationSettingsValue(conversation domain.Conversation) any {
	if len(conversation.Settings) == 0 {
		return nil
	}
	return conversation.Settings.JSONString()
}
