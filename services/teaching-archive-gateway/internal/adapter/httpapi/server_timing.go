package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/platform"
)

func writeTeachingServerTiming(w headerWriter, duration time.Duration, timing *platform.TeachingArchiveTiming) {
	metrics := []string{"app;dur=" + formatServerTimingDuration(duration)}
	if timing != nil && timing.DBInsert > 0 {
		metrics = append(metrics, "db.insert;dur="+formatServerTimingDuration(timing.DBInsert))
	}
	w.Header().Set("Server-Timing", strings.Join(metrics, ", "))
}

func formatServerTimingDuration(duration time.Duration) string {
	return strconv.FormatFloat(float64(duration)/float64(time.Millisecond), 'f', 3, 64)
}

type headerWriter interface {
	Header() http.Header
}
