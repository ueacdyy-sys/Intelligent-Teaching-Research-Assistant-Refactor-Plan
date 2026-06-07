package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"
)

func writeIdentityServerTiming(
	w http.ResponseWriter,
	handlerDuration time.Duration,
	preUsecaseDuration time.Duration,
	appDuration time.Duration,
	responseEncodeDuration time.Duration,
) {
	metrics := []string{
		"handler;dur=" + formatServerTimingDuration(handlerDuration),
		"pre.usecase;dur=" + formatServerTimingDuration(preUsecaseDuration),
		"app;dur=" + formatServerTimingDuration(appDuration),
	}
	if responseEncodeDuration > 0 {
		metrics = append(metrics, "response.encode;dur="+formatServerTimingDuration(responseEncodeDuration))
	}
	w.Header().Set("Server-Timing", strings.Join(metrics, ", "))
}

func formatServerTimingDuration(duration time.Duration) string {
	return strconv.FormatFloat(float64(duration)/float64(time.Millisecond), 'f', 3, 64)
}

func observableDuration(duration time.Duration) time.Duration {
	if duration <= 0 {
		return time.Nanosecond
	}
	return duration
}
