package main

import (
	"errors"
	"fmt"
	"math"
	"net/url"
	"os"
	"strings"
	"time"
)

func parseBaseURLs(value string) ([]string, error) {
	var baseURLs []string
	for _, part := range strings.Split(value, ",") {
		baseURL := strings.TrimRight(strings.TrimSpace(part), "/")
		if baseURL == "" {
			continue
		}
		parsed, err := url.Parse(baseURL)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			return nil, fmt.Errorf("invalid base-url: %q", baseURL)
		}
		baseURLs = append(baseURLs, baseURL)
	}
	if len(baseURLs) == 0 {
		return nil, errors.New("base-url or TEACHING_HTTP_BENCHMARK_BASE_URL is required")
	}
	return baseURLs, nil
}

func baseURLForOperation(baseURLs []string, opIndex int) string {
	if len(baseURLs) == 0 {
		return ""
	}
	if opIndex < 0 {
		return baseURLs[0]
	}
	return baseURLs[opIndex%len(baseURLs)]
}

func loadBalancingStrategy(baseURLs []string) string {
	if len(baseURLs) > 1 {
		return "ROUND_ROBIN"
	}
	return "SINGLE_GATEWAY"
}

func reportStatus(errorsCount int64) string {
	if errorsCount == 0 {
		return "PASSED"
	}
	return "FAILED"
}

func maskURL(value string) string {
	parsed, err := url.Parse(value)
	if err != nil || parsed.User == nil {
		return value
	}
	username := parsed.User.Username()
	if _, ok := parsed.User.Password(); !ok {
		return value
	}
	withoutUser := *parsed
	withoutUser.User = nil
	prefix := parsed.Scheme + "://"
	return prefix + username + ":***@" + strings.TrimPrefix(withoutUser.String(), prefix)
}

func maskURLs(values []string) []string {
	masked := make([]string, 0, len(values))
	for _, value := range values {
		masked = append(masked, maskURL(value))
	}
	return masked
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func roundMillis(duration time.Duration) float64 {
	return roundFloat(float64(duration) / float64(time.Millisecond))
}

func roundFloat(value float64) float64 {
	return math.Round(value*100) / 100
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
