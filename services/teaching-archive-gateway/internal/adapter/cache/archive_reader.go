package cache

import (
	"context"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
)

type ArchiveReader interface {
	List(ctx context.Context, query domain.ArchiveItemQuery) ([]domain.ArchiveItem, error)
}

type ArchiveReaderConfig struct {
	TTL        time.Duration
	MaxEntries int
}

type ArchiveReaderCache struct {
	next       ArchiveReader
	ttl        time.Duration
	maxEntries int
	now        func() time.Time
	mu         sync.Mutex
	entries    map[string]archiveCacheEntry
	order      []string
	inflight   map[string]*archiveCacheCall
}

type archiveCacheEntry struct {
	items     []domain.ArchiveItem
	expiresAt time.Time
}

type archiveCacheCall struct {
	done  chan struct{}
	items []domain.ArchiveItem
	err   error
}

func NewArchiveReader(next ArchiveReader, config ArchiveReaderConfig) *ArchiveReaderCache {
	return NewArchiveReaderWithClock(next, config, time.Now)
}

func NewArchiveReaderWithClock(
	next ArchiveReader,
	config ArchiveReaderConfig,
	now func() time.Time,
) *ArchiveReaderCache {
	maxEntries := config.MaxEntries
	if maxEntries < 1 {
		maxEntries = 1
	}
	if now == nil {
		now = time.Now
	}
	return &ArchiveReaderCache{
		next:       next,
		ttl:        config.TTL,
		maxEntries: maxEntries,
		now:        now,
		entries:    map[string]archiveCacheEntry{},
		inflight:   map[string]*archiveCacheCall{},
	}
}

func (c *ArchiveReaderCache) List(ctx context.Context, query domain.ArchiveItemQuery) ([]domain.ArchiveItem, error) {
	if c.ttl <= 0 {
		return c.next.List(ctx, query)
	}
	key := archiveQueryCacheKey(query)

	c.mu.Lock()
	if entry, ok := c.entries[key]; ok && c.now().Before(entry.expiresAt) {
		items := cloneArchiveItems(entry.items)
		c.mu.Unlock()
		recordCacheHit(ctx)
		return items, nil
	}
	if call, ok := c.inflight[key]; ok {
		c.mu.Unlock()
		waitStart := time.Now()
		select {
		case <-call.done:
			recordCacheSharedWait(ctx, time.Since(waitStart))
			return cloneArchiveItems(call.items), call.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	call := &archiveCacheCall{done: make(chan struct{})}
	c.inflight[key] = call
	c.mu.Unlock()

	items, err := c.next.List(ctx, query)
	c.mu.Lock()
	call.items = cloneArchiveItems(items)
	call.err = err
	delete(c.inflight, key)
	if err == nil {
		c.storeLocked(key, items)
	}
	close(call.done)
	c.mu.Unlock()
	return cloneArchiveItems(items), err
}

func (c *ArchiveReaderCache) storeLocked(key string, items []domain.ArchiveItem) {
	if _, exists := c.entries[key]; !exists {
		c.order = append(c.order, key)
	}
	c.entries[key] = archiveCacheEntry{
		items:     cloneArchiveItems(items),
		expiresAt: c.now().Add(c.ttl),
	}
	for len(c.entries) > c.maxEntries && len(c.order) > 0 {
		oldest := c.order[0]
		c.order = c.order[1:]
		delete(c.entries, oldest)
	}
}

func archiveQueryCacheKey(query domain.ArchiveItemQuery) string {
	studentIDs := append([]string(nil), query.StudentIDs...)
	sort.Strings(studentIDs)
	for index, studentID := range studentIDs {
		studentIDs[index] = url.QueryEscape(studentID)
	}
	parts := []string{
		"owner=" + url.QueryEscape(string(query.OwnerType)),
		"student=" + url.QueryEscape(query.StudentID),
		"students=" + strings.Join(studentIDs, ","),
		"material=" + url.QueryEscape(string(query.MaterialType)),
		"search=" + url.QueryEscape(query.SearchText),
		"page=" + strconv.Itoa(query.PageSize),
		"fetch=" + strconv.Itoa(query.FetchLimit),
	}
	if query.Cursor != nil {
		parts = append(parts,
			"cursorAt="+query.Cursor.CreatedAt.UTC().Format(time.RFC3339Nano),
			"cursorID="+url.QueryEscape(query.Cursor.ID),
		)
	}
	return strings.Join(parts, "|")
}

func cloneArchiveItems(items []domain.ArchiveItem) []domain.ArchiveItem {
	cloned := make([]domain.ArchiveItem, len(items))
	for index, item := range items {
		cloned[index] = item
		cloned[index].Tags = append([]string(nil), item.Tags...)
		cloned[index].AnalysisIntents = append([]domain.AnalysisIntent(nil), item.AnalysisIntents...)
	}
	return cloned
}

func recordCacheHit(ctx context.Context) {
	if timing := platform.TeachingArchiveTimingFromContext(ctx); timing != nil {
		timing.CacheHit = true
	}
}

func recordCacheSharedWait(ctx context.Context, duration time.Duration) {
	if timing := platform.TeachingArchiveTimingFromContext(ctx); timing != nil {
		timing.CacheHit = true
		if duration > 0 {
			timing.CacheSharedWait = duration
		}
	}
}
