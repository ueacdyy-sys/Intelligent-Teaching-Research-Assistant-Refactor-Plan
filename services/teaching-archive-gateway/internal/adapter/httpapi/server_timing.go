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
	if timing != nil && timing.CommandAppend > 0 {
		metrics = append(metrics, "command.append;dur="+formatServerTimingDuration(timing.CommandAppend))
	}
	if timing != nil && timing.ProjectionEnqueue > 0 {
		metrics = append(metrics, "projection.enqueue;dur="+formatServerTimingDuration(timing.ProjectionEnqueue))
	}
	if timing != nil && timing.ResponseEncode > 0 {
		metrics = append(metrics, "response.encode;dur="+formatServerTimingDuration(timing.ResponseEncode))
	}
	if timing != nil && timing.CacheHit {
		metrics = append(metrics, "cache.hit;dur="+formatServerTimingDuration(time.Microsecond))
	}
	if timing != nil && timing.CacheSharedWait > 0 {
		metrics = append(metrics, "cache.shared_wait;dur="+formatServerTimingDuration(timing.CacheSharedWait))
	}
	w.Header().Set("Server-Timing", strings.Join(metrics, ", "))
}

func writeTeachingJSON(
	w http.ResponseWriter,
	status int,
	payload any,
	handlerStart time.Time,
	preUsecaseDuration time.Duration,
	appDuration time.Duration,
	timing *platform.TeachingArchiveTiming,
) {
	encodeStart := time.Now()
	body, err := encodeJSONPayload(payload)
	if timing != nil {
		timing.ResponseEncode = observableResponseDuration(time.Since(encodeStart))
	}
	writeTeachingServerTiming(w, time.Since(handlerStart), preUsecaseDuration, appDuration, timing)
	if err != nil {
		writeResponseEncodingError(w)
		return
	}
	writeJSONBytes(w, status, body)
}

func formatServerTimingDuration(duration time.Duration) string {
	return strconv.FormatFloat(float64(duration)/float64(time.Millisecond), 'f', 3, 64)
}

func observableResponseDuration(duration time.Duration) time.Duration {
	if duration <= 0 {
		return time.Nanosecond
	}
	return duration
}

type headerWriter interface {
	Header() http.Header
}
