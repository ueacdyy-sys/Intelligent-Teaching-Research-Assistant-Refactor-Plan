package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

type stepLatencyRecorder struct {
	latencies map[string][]time.Duration
	recorded  map[string][]bool
}

func newStepLatencyRecorder(operations int, stepNames []string) stepLatencyRecorder {
	recorder := stepLatencyRecorder{
		latencies: make(map[string][]time.Duration, len(stepNames)),
		recorded:  make(map[string][]bool, len(stepNames)),
	}
	for _, stepName := range stepNames {
		recorder.latencies[stepName] = make([]time.Duration, operations)
		recorder.recorded[stepName] = make([]bool, operations)
	}
	return recorder
}

func (recorder stepLatencyRecorder) record(stepName string, opIndex int, latency time.Duration) {
	latencies, ok := recorder.latencies[stepName]
	if !ok || opIndex < 0 || opIndex >= len(latencies) {
		return
	}
	latencies[opIndex] = latency
	recorder.recorded[stepName][opIndex] = true
}

func (recorder stepLatencyRecorder) summarize() map[string]latencySummary {
	if len(recorder.latencies) == 0 {
		return nil
	}
	summaries := make(map[string]latencySummary, len(recorder.latencies))
	for stepName, latencies := range recorder.latencies {
		recorded := recorder.recorded[stepName]
		recordedLatencies := make([]time.Duration, 0, len(latencies))
		for index, latency := range latencies {
			if recorded[index] {
				recordedLatencies = append(recordedLatencies, latency)
			}
		}
		if len(recordedLatencies) > 0 {
			summaries[stepName] = summarizeLatencies(recordedLatencies)
		}
	}
	return summaries
}

func summarizeLatencies(latencies []time.Duration) latencySummary {
	if len(latencies) == 0 {
		return latencySummary{}
	}
	sorted := append([]time.Duration(nil), latencies...)
	sort.Slice(sorted, func(left int, right int) bool {
		return sorted[left] < sorted[right]
	})
	var total time.Duration
	for _, latency := range sorted {
		total += latency
	}
	return latencySummary{
		MinMS: roundMillis(sorted[0]),
		AvgMS: roundMillis(total / time.Duration(len(sorted))),
		P50MS: roundMillis(percentile(sorted, 50)),
		P95MS: roundMillis(percentile(sorted, 95)),
		P99MS: roundMillis(percentile(sorted, 99)),
		MaxMS: roundMillis(sorted[len(sorted)-1]),
	}
}

func percentile(sorted []time.Duration, p int) time.Duration {
	if len(sorted) == 0 {
		return 0
	}
	index := int(math.Ceil((float64(p)/100)*float64(len(sorted)))) - 1
	if index < 0 {
		index = 0
	}
	if index >= len(sorted) {
		index = len(sorted) - 1
	}
	return sorted[index]
}

func waitHealth(ctx context.Context, client *http.Client, baseURL string) error {
	deadline, ok := ctx.Deadline()
	if !ok {
		deadline = time.Now().Add(30 * time.Second)
	}
	var lastErr error
	for time.Now().Before(deadline) {
		if err := requestHealth(ctx, client, baseURL); err != nil {
			lastErr = err
		} else {
			return nil
		}
		time.Sleep(200 * time.Millisecond)
	}
	return fmt.Errorf("gateway health check failed: %w", lastErr)
}

func requestHealth(ctx context.Context, client *http.Client, baseURL string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/health", nil)
	if err != nil {
		return err
	}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	_, _ = io.Copy(io.Discard, response.Body)
	_ = response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("health status = %d", response.StatusCode)
	}
	return nil
}

func login(ctx context.Context, client *http.Client, baseURL string, identifier string, role string, entryPoint string) (sessionState, operationResult, error) {
	body := map[string]string{
		"identifier":    identifier,
		"password":      "ueacd",
		"requestedRole": role,
		"entryPoint":    entryPoint,
	}
	var response sessionResponse
	result, err := doJSON(ctx, client, http.MethodPost, baseURL+"/v1/identity/sessions/password", "", body, http.StatusCreated, &response)
	if err != nil {
		return sessionState{}, result, err
	}
	return sessionState{
		AccessToken:  response.AccessToken,
		RefreshToken: response.RefreshToken,
		SessionID:    response.Principal.SessionID,
	}, result, nil
}

func refreshSession(ctx context.Context, client *http.Client, baseURL string, refreshToken string) (sessionState, operationResult, error) {
	var response sessionResponse
	result, err := doJSON(ctx, client, http.MethodPost, baseURL+"/v1/identity/sessions/refresh", "", map[string]string{"refreshToken": refreshToken}, http.StatusOK, &response)
	if err != nil {
		return sessionState{}, result, err
	}
	return sessionState{
		AccessToken:  response.AccessToken,
		RefreshToken: response.RefreshToken,
		SessionID:    response.Principal.SessionID,
	}, result, nil
}

func getPrincipal(ctx context.Context, client *http.Client, baseURL string, accessToken string) (operationResult, error) {
	status, result, err := getPrincipalStatus(ctx, client, baseURL, accessToken)
	if err != nil {
		return result, err
	}
	if status != http.StatusOK {
		return result, fmt.Errorf("principal lookup status = %d", status)
	}
	return result, nil
}

func getPrincipalStatus(ctx context.Context, client *http.Client, baseURL string, accessToken string) (int, operationResult, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/v1/identity/principal", nil)
	if err != nil {
		return 0, operationResult{}, err
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	response, err := client.Do(request)
	if err != nil {
		return 0, operationResult{}, err
	}
	result := operationResultFromResponse(response)
	_, _ = io.Copy(io.Discard, response.Body)
	_ = response.Body.Close()
	return response.StatusCode, result, nil
}

func revokeSession(ctx context.Context, client *http.Client, baseURL string, session sessionState) (operationResult, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodDelete, baseURL+"/v1/identity/sessions/"+url.PathEscape(session.SessionID), nil)
	if err != nil {
		return operationResult{}, err
	}
	request.Header.Set("Authorization", "Bearer "+session.AccessToken)
	response, err := client.Do(request)
	if err != nil {
		return operationResult{}, err
	}
	result := operationResultFromResponse(response)
	_, _ = io.Copy(io.Discard, response.Body)
	_ = response.Body.Close()
	if response.StatusCode != http.StatusNoContent && response.StatusCode != http.StatusUnauthorized {
		return result, fmt.Errorf("revoke status = %d", response.StatusCode)
	}
	return result, nil
}

func doJSON(ctx context.Context, client *http.Client, method string, endpoint string, bearer string, payload any, expectedStatus int, target any) (operationResult, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return operationResult{}, err
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(data))
	if err != nil {
		return operationResult{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		request.Header.Set("Authorization", "Bearer "+bearer)
	}
	response, err := client.Do(request)
	if err != nil {
		return operationResult{}, err
	}
	defer response.Body.Close()
	result := operationResultFromResponse(response)
	if response.StatusCode != expectedStatus {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 2048))
		return result, fmt.Errorf("%s %s status = %d body = %s", method, endpoint, response.StatusCode, string(body))
	}
	if target == nil {
		_, _ = io.Copy(io.Discard, response.Body)
		return result, nil
	}
	if err := json.NewDecoder(response.Body).Decode(target); err != nil {
		return result, err
	}
	return result, nil
}

func operationResultFromResponse(response *http.Response) operationResult {
	timings := parseServerTimingDurations(response.Header.Get("Server-Timing"))
	if len(timings) == 0 {
		return operationResult{}
	}
	return operationResult{serverTimings: timings}
}

func observedTimings(values []map[string]time.Duration) map[string][]time.Duration {
	timings := map[string][]time.Duration{}
	for _, metrics := range values {
		for name, value := range metrics {
			timings[name] = append(timings[name], value)
		}
	}
	return timings
}

func observedClientServerGaps(latencies []time.Duration, serverTimings []map[string]time.Duration) []time.Duration {
	gaps := make([]time.Duration, 0, len(serverTimings))
	for index, metrics := range serverTimings {
		if index >= len(latencies) {
			break
		}
		appTiming, ok := metrics["app"]
		if !ok {
			continue
		}
		gap := latencies[index] - appTiming
		if gap < 0 {
			gap = 0
		}
		gaps = append(gaps, gap)
	}
	return gaps
}

func parseServerTimingDurations(value string) map[string]time.Duration {
	timings := map[string]time.Duration{}
	for _, metric := range strings.Split(value, ",") {
		parts := strings.Split(metric, ";")
		name := strings.TrimSpace(parts[0])
		if len(parts) < 2 || name == "" {
			continue
		}
		for _, attribute := range parts[1:] {
			attribute = strings.TrimSpace(attribute)
			if !strings.HasPrefix(attribute, "dur=") {
				continue
			}
			durationMS, err := strconv.ParseFloat(strings.TrimPrefix(attribute, "dur="), 64)
			if err != nil {
				continue
			}
			timings[name] = time.Duration(durationMS * float64(time.Millisecond))
		}
	}
	return timings
}

func cleanupByRevoke(ctx context.Context, client *http.Client, baseURLs []string, sessions []sessionState) {
	for index, session := range sessions {
		if session.AccessToken == "" || session.SessionID == "" {
			continue
		}
		_, _ = revokeSession(ctx, client, baseURLForOperation(baseURLs, index), session)
	}
}

func phaseError(name string, phase phaseReport, firstErr error) error {
	if phase.Errors == 0 {
		return nil
	}
	return fmt.Errorf("%s failed with %d errors; first error: %w", name, phase.Errors, firstErr)
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
		return nil, errors.New("base-url or IDENTITY_HTTP_BENCHMARK_BASE_URL is required")
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

func minInt(left int, right int) int {
	if left < right {
		return left
	}
	return right
}
