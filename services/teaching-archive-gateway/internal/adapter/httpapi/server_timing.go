package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/platform"
)

func writeTeachingServerTiming(
	w headerWriter,
	handlerDuration time.Duration,
	preUsecaseDuration time.Duration,
	appDuration time.Duration,
	timing *platform.TeachingArchiveTiming,
) {
	metrics := []string{
		"handler;dur=" + formatServerTimingDuration(handlerDuration),
		"pre.usecase;dur=" + formatServerTimingDuration(preUsecaseDuration),
		"app;dur=" + formatServerTimingDuration(appDuration),
	}
	if timing != nil && timing.DBInsert > 0 {
		metrics = append(metrics, "db.insert;dur="+formatServerTimingDuration(timing.DBInsert))
	}
	if timing != nil && timing.DBBatchWait > 0 {
		metrics = append(metrics, "db.batch_wait;dur="+formatServerTimingDuration(timing.DBBatchWait))
	}
	if timing != nil && timing.DBAcquire > 0 {
		metrics = append(metrics, "db.acquire;dur="+formatServerTimingDuration(timing.DBAcquire))
	}
	if timing != nil && timing.DBExec > 0 {
		metrics = append(metrics, "db.exec;dur="+formatServerTimingDuration(timing.DBExec))
	}
	if timing != nil && timing.DBQuery > 0 {
		metrics = append(metrics, "db.query;dur="+formatServerTimingDuration(timing.DBQuery))
	}
	w.Header().Set("Server-Timing", strings.Join(metrics, ", "))
}

func formatServerTimingDuration(duration time.Duration) string {
	return strconv.FormatFloat(float64(duration)/float64(time.Millisecond), 'f', 3, 64)
}

type headerWriter interface {
	Header() http.Header
}
