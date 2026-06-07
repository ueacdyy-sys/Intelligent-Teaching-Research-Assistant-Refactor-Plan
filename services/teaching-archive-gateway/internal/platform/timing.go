package platform

import (
	"context"
	"time"
)

type TeachingArchiveTiming struct {
	DBBatchWait       time.Duration
	DBAcquire         time.Duration
	DBExec            time.Duration
	DBQuery           time.Duration
	DBInsert          time.Duration
	CommandAppend     time.Duration
	ProjectionEnqueue time.Duration
	ResponseEncode    time.Duration
	CacheHit          bool
	CacheSharedWait   time.Duration
}

type teachingArchiveTimingContextKey struct{}

func WithTeachingArchiveTiming(ctx context.Context, timing *TeachingArchiveTiming) context.Context {
	return context.WithValue(ctx, teachingArchiveTimingContextKey{}, timing)
}

func TeachingArchiveTimingFromContext(ctx context.Context) *TeachingArchiveTiming {
	timing, _ := ctx.Value(teachingArchiveTimingContextKey{}).(*TeachingArchiveTiming)
	return timing
}
