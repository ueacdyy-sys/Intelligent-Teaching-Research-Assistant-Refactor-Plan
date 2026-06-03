package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type QuizSubmissionBatchConfig struct {
	MaxSize  int
	MaxDelay time.Duration
	Workers  int
}

var ErrQuizSubmissionRepositoryClosed = errors.New("quiz submission repository closed")

type BatchingQuizSubmissionRepository struct {
	db        DB
	base      *ArchiveRepository
	maxSize   int
	maxDelay  time.Duration
	workers   int
	requests  chan quizSubmissionCreateRequest
	closing   chan struct{}
	workerWG  sync.WaitGroup
	closeOnce sync.Once
	enqueueMu sync.RWMutex
	enqueueWG sync.WaitGroup
	closed    bool
}

type quizSubmissionCreateRequest struct {
	ctx        context.Context
	submission domain.QuizSubmission
	enqueuedAt time.Time
	result     chan quizSubmissionCreateResult
}

type quizSubmissionCreateResult struct {
	created bool
	err     error
}

func NewBatchingQuizSubmissionRepository(db DB, config QuizSubmissionBatchConfig) *BatchingQuizSubmissionRepository {
	maxSize := config.MaxSize
	if maxSize < 2 {
		maxSize = 2
	}
	workers := config.Workers
	if workers < 1 {
		workers = 1
	}
	repository := &BatchingQuizSubmissionRepository{
		db:       db,
		base:     NewArchiveRepository(db),
		maxSize:  maxSize,
		maxDelay: config.MaxDelay,
		workers:  workers,
		requests: make(chan quizSubmissionCreateRequest, maxSize*workers*4),
		closing:  make(chan struct{}),
	}
	for index := 0; index < workers; index++ {
		repository.workerWG.Add(1)
		go repository.run()
	}
	return repository
}

func (r *BatchingQuizSubmissionRepository) WorkerCount() int {
	return r.workers
}

func (r *BatchingQuizSubmissionRepository) GetByID(
	ctx context.Context,
	id string,
) (domain.ArchiveItem, bool, error) {
	return r.base.GetByID(ctx, id)
}

func (r *BatchingQuizSubmissionRepository) CreateQuizSubmission(
	ctx context.Context,
	submission domain.QuizSubmission,
) error {
	return r.base.CreateQuizSubmission(ctx, submission)
}

func (r *BatchingQuizSubmissionRepository) CreateQuizSubmissionForExistingTeachingQuiz(
	ctx context.Context,
	submission domain.QuizSubmission,
) (bool, error) {
	request := quizSubmissionCreateRequest{
		ctx:        ctx,
		submission: submission,
		enqueuedAt: time.Now(),
		result:     make(chan quizSubmissionCreateResult, 1),
	}

	r.enqueueMu.RLock()
	if r.closed {
		r.enqueueMu.RUnlock()
		return false, ErrQuizSubmissionRepositoryClosed
	}
	r.enqueueWG.Add(1)
	r.enqueueMu.RUnlock()
	select {
	case r.requests <- request:
		r.enqueueWG.Done()
	case <-ctx.Done():
		r.enqueueWG.Done()
		return false, ctx.Err()
	case <-r.closing:
		r.enqueueWG.Done()
		return false, ErrQuizSubmissionRepositoryClosed
	}

	result := <-request.result
	return result.created, result.err
}

func (r *BatchingQuizSubmissionRepository) Close() {
	r.closeOnce.Do(func() {
		r.enqueueMu.Lock()
		r.closed = true
		close(r.closing)
		r.enqueueMu.Unlock()
		r.enqueueWG.Wait()
		close(r.requests)
		r.workerWG.Wait()
	})
}

func (r *BatchingQuizSubmissionRepository) run() {
	defer r.workerWG.Done()
	for first := range r.requests {
		batch := []quizSubmissionCreateRequest{first}
		r.collectBatch(&batch)
		r.flush(batch)
	}
}

func (r *BatchingQuizSubmissionRepository) collectBatch(batch *[]quizSubmissionCreateRequest) {
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

func (r *BatchingQuizSubmissionRepository) collectReadyRequests(batch *[]quizSubmissionCreateRequest) {
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

func (r *BatchingQuizSubmissionRepository) flush(batch []quizSubmissionCreateRequest) {
	flushStart := time.Now()
	active := make([]quizSubmissionCreateRequest, 0, len(batch))
	for _, request := range batch {
		if err := request.ctx.Err(); err != nil {
			request.result <- quizSubmissionCreateResult{err: err}
			continue
		}
		recordDBBatchWaitTiming(request.ctx, observableDuration(flushStart.Sub(request.enqueuedAt)))
		active = append(active, request)
	}
	if len(active) == 0 {
		return
	}

	statement, args := buildInsertExistingTeachingQuizSubmissionsStatement(active)
	queryStart := time.Now()
	rows, err := r.db.Query(context.Background(), statement, args...)
	queryDuration := observableDuration(time.Since(queryStart))
	for _, request := range active {
		recordDBExecTiming(request.ctx, queryDuration)
		recordDBInsertTiming(request.ctx, queryDuration)
	}
	if err != nil {
		completeQuizSubmissionCreateBatch(active, quizSubmissionCreateResult{err: err})
		return
	}
	defer rows.Close()

	createdIDs := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			completeQuizSubmissionCreateBatch(active, quizSubmissionCreateResult{err: err})
			return
		}
		createdIDs[id] = true
	}
	if err := rows.Err(); err != nil {
		completeQuizSubmissionCreateBatch(active, quizSubmissionCreateResult{err: err})
		return
	}
	for _, request := range active {
		request.result <- quizSubmissionCreateResult{created: createdIDs[request.submission.ID]}
	}
}

func completeQuizSubmissionCreateBatch(batch []quizSubmissionCreateRequest, result quizSubmissionCreateResult) {
	for _, request := range batch {
		request.result <- result
	}
}

func buildInsertExistingTeachingQuizSubmissionsStatement(batch []quizSubmissionCreateRequest) (string, []any) {
	var builder strings.Builder
	builder.WriteString(`
		WITH input (
			id,
			quiz_archive_item_id,
			student_id,
			submitted_by_principal_id,
			answer_ref,
			status,
			submitted_at
		) AS (VALUES `)

	args := make([]any, 0, len(batch)*7+2)
	for index, request := range batch {
		if index > 0 {
			builder.WriteString(", ")
		}
		offset := index * 7
		builder.WriteString(fmt.Sprintf(
			"($%d::text, $%d::text, $%d::text, $%d::text, $%d::text, $%d::text, $%d::timestamptz)",
			offset+1,
			offset+2,
			offset+3,
			offset+4,
			offset+5,
			offset+6,
			offset+7,
		))
		submission := request.submission
		args = append(args,
			submission.ID,
			submission.QuizArchiveItemID,
			submission.StudentID,
			submission.SubmittedByPrincipalID,
			submission.AnswerRef,
			submission.Status,
			submission.SubmittedAt,
		)
	}
	ownerTypeIndex := len(args) + 1
	materialTypeIndex := len(args) + 2
	builder.WriteString(fmt.Sprintf(`)
		INSERT INTO teaching_quiz_submissions (
			id,
			quiz_archive_item_id,
			student_id,
			submitted_by_principal_id,
			answer_ref,
			status,
			submitted_at
		)
		SELECT
			input.id,
			item.id,
			input.student_id,
			input.submitted_by_principal_id,
			input.answer_ref,
			input.status,
			input.submitted_at
		FROM input
		JOIN teaching_archive_items AS item
			ON item.id = input.quiz_archive_item_id
			AND item.owner_type = $%d
			AND item.material_type = $%d
		RETURNING id
	`, ownerTypeIndex, materialTypeIndex))
	args = append(args, domain.OwnerTypeTeaching, domain.MaterialTypeQuiz)
	return builder.String(), args
}
