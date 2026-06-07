package cache_test

import (
	"context"
	"sync"
	"testing"
	"time"

	teachingcache "ita-refactor/services/teaching-archive-gateway/internal/adapter/cache"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
)

func TestArchiveReaderCacheCoalescesConcurrentMisses(t *testing.T) {
	reader := newBlockingArchiveReader([]domain.ArchiveItem{testArchiveItem("tarch_cached")})
	cache := teachingcache.NewArchiveReader(reader, teachingcache.ArchiveReaderConfig{
		TTL:        time.Second,
		MaxEntries: 8,
	})
	query := domain.ArchiveItemQuery{
		OwnerType:    domain.OwnerTypeTeaching,
		MaterialType: domain.MaterialTypeQuiz,
		PageSize:     10,
		FetchLimit:   11,
	}

	firstErr := make(chan error, 1)
	go func() {
		_, err := cache.List(context.Background(), query)
		firstErr <- err
	}()
	<-reader.started

	const waiters = 6
	var wg sync.WaitGroup
	errs := make(chan error, waiters)
	for index := 0; index < waiters; index++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := cache.List(context.Background(), query)
			errs <- err
		}()
	}
	close(reader.release)

	if err := <-firstErr; err != nil {
		t.Fatalf("first List returned error: %v", err)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("waiter List returned error: %v", err)
		}
	}
	if reader.calls() != 1 {
		t.Fatalf("wrapped reader calls = %d, want 1", reader.calls())
	}
}

func TestArchiveReaderCacheKeysIncludeScopedQuery(t *testing.T) {
	now := time.Date(2026, 6, 4, 10, 0, 0, 0, time.UTC)
	reader := &recordingArchiveReader{}
	cache := teachingcache.NewArchiveReaderWithClock(
		reader,
		teachingcache.ArchiveReaderConfig{TTL: time.Hour, MaxEntries: 8},
		func() time.Time { return now },
	)

	queryA := domain.ArchiveItemQuery{OwnerType: domain.OwnerTypeStudent, StudentID: "student_a", PageSize: 10, FetchLimit: 11}
	queryB := domain.ArchiveItemQuery{OwnerType: domain.OwnerTypeStudent, StudentID: "student_b", PageSize: 10, FetchLimit: 11}

	if _, err := cache.List(context.Background(), queryA); err != nil {
		t.Fatalf("first queryA List returned error: %v", err)
	}
	timing := &platform.TeachingArchiveTiming{}
	if _, err := cache.List(platform.WithTeachingArchiveTiming(context.Background(), timing), queryA); err != nil {
		t.Fatalf("second queryA List returned error: %v", err)
	}
	if !timing.CacheHit {
		t.Fatalf("second queryA should record cache hit")
	}
	if _, err := cache.List(context.Background(), queryB); err != nil {
		t.Fatalf("queryB List returned error: %v", err)
	}

	if reader.calls() != 2 {
		t.Fatalf("wrapped reader calls = %d, want 2 for distinct scoped queries", reader.calls())
	}
}

func TestArchiveReaderCacheReturnsCopies(t *testing.T) {
	now := time.Date(2026, 6, 4, 10, 0, 0, 0, time.UTC)
	reader := &recordingArchiveReader{items: []domain.ArchiveItem{testArchiveItem("tarch_copy")}}
	cache := teachingcache.NewArchiveReaderWithClock(
		reader,
		teachingcache.ArchiveReaderConfig{TTL: time.Hour, MaxEntries: 8},
		func() time.Time { return now },
	)
	query := domain.ArchiveItemQuery{OwnerType: domain.OwnerTypeTeaching, PageSize: 10, FetchLimit: 11}

	first, err := cache.List(context.Background(), query)
	if err != nil {
		t.Fatalf("first List returned error: %v", err)
	}
	first[0].Tags[0] = "mutated"
	first[0].AnalysisIntents[0] = domain.AnalysisIntentTutoring

	second, err := cache.List(context.Background(), query)
	if err != nil {
		t.Fatalf("second List returned error: %v", err)
	}
	if second[0].Tags[0] != "performance" {
		t.Fatalf("cached tag = %q, want immutable copy", second[0].Tags[0])
	}
	if second[0].AnalysisIntents[0] != domain.AnalysisIntentArchiveOnly {
		t.Fatalf("cached intent = %q, want immutable copy", second[0].AnalysisIntents[0])
	}
}

func TestArchiveReaderCacheExpiresEntries(t *testing.T) {
	now := time.Date(2026, 6, 4, 10, 0, 0, 0, time.UTC)
	reader := &recordingArchiveReader{}
	cache := teachingcache.NewArchiveReaderWithClock(
		reader,
		teachingcache.ArchiveReaderConfig{TTL: time.Millisecond, MaxEntries: 8},
		func() time.Time { return now },
	)
	query := domain.ArchiveItemQuery{OwnerType: domain.OwnerTypeTeaching, PageSize: 10, FetchLimit: 11}

	if _, err := cache.List(context.Background(), query); err != nil {
		t.Fatalf("first List returned error: %v", err)
	}
	now = now.Add(2 * time.Millisecond)
	if _, err := cache.List(context.Background(), query); err != nil {
		t.Fatalf("expired List returned error: %v", err)
	}
	if reader.calls() != 2 {
		t.Fatalf("wrapped reader calls after expiry = %d, want 2", reader.calls())
	}
}

type blockingArchiveReader struct {
	started chan struct{}
	release chan struct{}
	once    sync.Once
	mu      sync.Mutex
	count   int
	items   []domain.ArchiveItem
}

func newBlockingArchiveReader(items []domain.ArchiveItem) *blockingArchiveReader {
	return &blockingArchiveReader{
		started: make(chan struct{}),
		release: make(chan struct{}),
		items:   items,
	}
}

func (r *blockingArchiveReader) List(context.Context, domain.ArchiveItemQuery) ([]domain.ArchiveItem, error) {
	r.mu.Lock()
	r.count += 1
	r.mu.Unlock()
	r.once.Do(func() { close(r.started) })
	<-r.release
	return r.items, nil
}

func (r *blockingArchiveReader) calls() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.count
}

type recordingArchiveReader struct {
	mu    sync.Mutex
	count int
	items []domain.ArchiveItem
}

func (r *recordingArchiveReader) List(_ context.Context, query domain.ArchiveItemQuery) ([]domain.ArchiveItem, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.count += 1
	if len(r.items) > 0 {
		return r.items, nil
	}
	return []domain.ArchiveItem{testArchiveItem("tarch_" + query.StudentID)}, nil
}

func (r *recordingArchiveReader) calls() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.count
}

func testArchiveItem(id string) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              id,
		OwnerType:       domain.OwnerTypeTeaching,
		MaterialType:    domain.MaterialTypeQuiz,
		Title:           "Week 3 Quiz",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://archive/week-3.json",
		Tags:            []string{"performance"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
		OCRStatus:       domain.OCRStatusNotRequired,
		CreatedAt:       time.Date(2026, 6, 4, 9, 0, 0, 0, time.UTC),
	}
}
