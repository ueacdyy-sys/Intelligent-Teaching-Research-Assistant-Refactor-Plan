package platform

import (
	"context"
	"time"
)

type TeachingArchiveTiming struct {
	DBInsert time.Duration
}

type teachingArchiveTimingContextKey struct{}

func WithTeachingArchiveTiming(ctx context.Context, timing *TeachingArchiveTiming) context.Context {
	return context.WithValue(ctx, teachingArchiveTimingContextKey{}, timing)
}

func TeachingArchiveTimingFromContext(ctx context.Context) *TeachingArchiveTiming {
	timing, _ := ctx.Value(teachingArchiveTimingContextKey{}).(*TeachingArchiveTiming)
	return timing
}
