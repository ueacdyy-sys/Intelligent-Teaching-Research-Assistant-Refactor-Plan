package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type benchmarkConfig struct {
	BaseURL                string
	AgentAPIKey            string
	OutPath                string
	Concurrency            int
	Operations             int
	Timeout                time.Duration
	MaxConnsPerHost        int
	WarmConnectionsPerHost int
	WarmConnectionRetries  int
}

type benchmarkReport struct {
	GeneratedAt      string                    `json:"generatedAt"`
	BenchmarkKind    string                    `json:"benchmarkKind"`
	WorkloadType     string                    `json:"workloadType"`
	Status           string                    `json:"status"`
	BaseURL          string                    `json:"baseUrl"`
	GatewayCount     int                       `json:"gatewayCount"`
	GatewayBaseURLs  []string                  `json:"gatewayBaseUrls"`
	LoadBalancing    string                    `json:"loadBalancingStrategy"`
	TransportProfile benchmarkTransportProfile `json:"transportProfile"`
	Concurrency      int                       `json:"concurrency"`
	Operations       int                       `json:"operations"`
	TotalDurationMS  float64                   `json:"totalDurationMs"`
	Phases           map[string]phaseReport    `json:"phases"`
}

type benchmarkTransportProfile struct {
	MaxIdleConns           int    `json:"maxIdleConns"`
	MaxIdleConnsPerHost    int    `json:"maxIdleConnsPerHost"`
	MaxConnsPerHost        int    `json:"maxConnsPerHost"`
	WarmConnectionsPerHost int    `json:"warmConnectionsPerHost"`
	WarmConnectionsTotal   int    `json:"warmConnectionsTotal"`
	WarmConnectionStrategy string `json:"warmConnectionStrategy"`
	WarmConnectionRetries  int    `json:"warmConnectionRetries"`
}

type phaseReport struct {
	Name                         string                    `json:"name"`
	Operations                   int                       `json:"operations"`
	Errors                       int64                     `json:"errors"`
	FirstError                   string                    `json:"firstError,omitempty"`
	RPS                          float64                   `json:"rps"`
	LatencyMS                    latencySummary            `json:"latencyMs"`
	ServerTimingMS               *latencySummary           `json:"serverTimingMs,omitempty"`
	ServerTimingSamples          int                       `json:"serverTimingSamples,omitempty"`
	ServerTimingBreakdownMS      map[string]latencySummary `json:"serverTimingBreakdownMs,omitempty"`
	ServerTimingBreakdownSamples map[string]int            `json:"serverTimingBreakdownSamples,omitempty"`
}

type latencySummary struct {
	MinMS float64 `json:"min"`
	AvgMS float64 `json:"avg"`
	P50MS float64 `json:"p50"`
	P95MS float64 `json:"p95"`
	P99MS float64 `json:"p99"`
	MaxMS float64 `json:"max"`
}

func main() {
	config := parseConfig()
	if err := run(config); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func parseConfig() benchmarkConfig {
	config := benchmarkConfig{}
	flag.StringVar(&config.BaseURL, "base-url", os.Getenv("CONVERSATION_HTTP_BENCHMARK_BASE_URL"), "conversation gateway base URL or comma-separated URLs")
	flag.StringVar(&config.AgentAPIKey, "agent-api-key", getenv("AGENT_API_KEY", "ueacd"), "agent API key sent as X-Agent-Api-Key")
	flag.StringVar(&config.OutPath, "out", "", "optional JSON report path")
	flag.IntVar(&config.Concurrency, "concurrency", 64, "number of concurrent workers")
	flag.IntVar(&config.Operations, "operations", 500, "create conversation operations to run")
	flag.DurationVar(&config.Timeout, "timeout", 60*time.Second, "benchmark timeout")
	flag.IntVar(&config.MaxConnsPerHost, "max-conns-per-host", 0, "optional HTTP transport max connections per gateway host")
	flag.IntVar(&config.WarmConnectionsPerHost, "warm-connections-per-host", 0, "optional keep-alive connections to prewarm per gateway host")
	flag.IntVar(&config.WarmConnectionRetries, "warm-connection-retries", 3, "warm-up retries per connection after transient listener refusal")
	flag.Parse()
	return config
}

func run(config benchmarkConfig) error {
	if config.BaseURL == "" {
		return errors.New("base-url or CONVERSATION_HTTP_BENCHMARK_BASE_URL is required")
	}
	if config.Concurrency < 1 {
		return errors.New("concurrency must be positive")
	}
	if config.Operations < 1 {
		return errors.New("operations must be positive")
	}
	if config.MaxConnsPerHost < 0 {
		return errors.New("max-conns-per-host must be zero or positive")
	}
	if config.WarmConnectionsPerHost < 0 {
		return errors.New("warm-connections-per-host must be zero or positive")
	}
	if config.WarmConnectionRetries < 0 {
		return errors.New("warm-connection-retries must be zero or positive")
	}

	baseURLs, err := parseBaseURLs(config.BaseURL)
	if err != nil {
		return err
	}
	client, transportProfile := buildHTTPClient(config, len(baseURLs))

	ctx, cancel := context.WithTimeout(context.Background(), config.Timeout)
	defer cancel()
	for _, baseURL := range baseURLs {
		if err := waitHealth(ctx, client, baseURL); err != nil {
			return err
		}
	}
	if err := warmHTTPConnections(ctx, client, baseURLs, config.WarmConnectionsPerHost, config.WarmConnectionRetries); err != nil {
		return err
	}

	start := time.Now()
	createPhase := runCreateConversationPhase(ctx, client, baseURLs, config)
	report := benchmarkReport{
		GeneratedAt:      time.Now().UTC().Format(time.RFC3339Nano),
		BenchmarkKind:    "conversation_write_gateway",
		WorkloadType:     "HTTP_BENCHMARK",
		Status:           reportStatus(createPhase.Errors),
		BaseURL:          maskURL(baseURLs[0]),
		GatewayCount:     len(baseURLs),
		GatewayBaseURLs:  maskURLs(baseURLs),
		LoadBalancing:    loadBalancingStrategy(baseURLs),
		TransportProfile: transportProfile,
		Concurrency:      config.Concurrency,
		Operations:       config.Operations,
		TotalDurationMS:  roundMillis(time.Since(start)),
		Phases: map[string]phaseReport{
			"createConversation": createPhase,
		},
	}

	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return fmt.Errorf("encode report: %w", err)
	}
	if config.OutPath != "" {
		if err := os.MkdirAll(filepath.Dir(config.OutPath), 0o755); err != nil {
			return fmt.Errorf("create report directory: %w", err)
		}
		if err := os.WriteFile(config.OutPath, append(data, '\n'), 0o644); err != nil {
			return fmt.Errorf("write report: %w", err)
		}
	}
	fmt.Println(string(data))
	if createPhase.Errors > 0 {
		return fmt.Errorf("createConversation failed with %d errors", createPhase.Errors)
	}
	return nil
}

func buildHTTPClient(config benchmarkConfig, gatewayCount int) (*http.Client, benchmarkTransportProfile) {
	warmConnectionsTotal := maxInt(0, config.WarmConnectionsPerHost) * maxInt(1, gatewayCount)
	maxIdleConns := maxInt(config.Concurrency*4, warmConnectionsTotal)
	maxIdleConnsPerHost := maxInt(config.Concurrency, config.WarmConnectionsPerHost)
	transport := &http.Transport{
		MaxIdleConns:        maxIdleConns,
		MaxIdleConnsPerHost: maxIdleConnsPerHost,
		MaxConnsPerHost:     config.MaxConnsPerHost,
		IdleConnTimeout:     30 * time.Second,
	}
	return &http.Client{
			Timeout:   10 * time.Second,
			Transport: transport,
		}, benchmarkTransportProfile{
			MaxIdleConns:           maxIdleConns,
			MaxIdleConnsPerHost:    maxIdleConnsPerHost,
			MaxConnsPerHost:        config.MaxConnsPerHost,
			WarmConnectionsPerHost: config.WarmConnectionsPerHost,
			WarmConnectionsTotal:   warmConnectionsTotal,
			WarmConnectionStrategy: warmConnectionStrategy(config.WarmConnectionsPerHost),
			WarmConnectionRetries:  config.WarmConnectionRetries,
		}
}

func warmHTTPConnections(
	ctx context.Context,
	client *http.Client,
	baseURLs []string,
	connectionsPerHost int,
	retries int,
) error {
	return warmHTTPConnectionsWithRequester(ctx, baseURLs, connectionsPerHost, retries, func(ctx context.Context, baseURL string) error {
		return requestHealth(ctx, client, baseURL)
	})
}

func warmHTTPConnectionsWithRequester(
	ctx context.Context,
	baseURLs []string,
	connectionsPerHost int,
	retries int,
	requester func(context.Context, string) error,
) error {
	if connectionsPerHost <= 0 {
		return nil
	}
	for _, baseURL := range baseURLs {
		if err := warmHTTPConnectionsForHost(ctx, baseURL, connectionsPerHost, retries, requester); err != nil {
			return err
		}
	}
	return nil
}

func warmHTTPConnectionsForHost(
	ctx context.Context,
	baseURL string,
	connectionsPerHost int,
	retries int,
	requester func(context.Context, string) error,
) error {
	var wg sync.WaitGroup
	errs := make(chan error, connectionsPerHost)
	start := make(chan struct{})
	for index := 0; index < connectionsPerHost; index++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if err := requestWithWarmRetries(ctx, baseURL, retries, requester); err != nil {
				errs <- err
			}
		}()
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		return fmt.Errorf("warm transport connections: %w", err)
	}
	return nil
}

func requestWithWarmRetries(
	ctx context.Context,
	baseURL string,
	retries int,
	requester func(context.Context, string) error,
) error {
	attempts := maxInt(1, retries+1)
	var lastErr error
	for attempt := 0; attempt < attempts; attempt++ {
		if err := requester(ctx, baseURL); err != nil {
			lastErr = err
		} else {
			return nil
		}
		if attempt == attempts-1 {
			break
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(25 * time.Millisecond):
		}
	}
	return lastErr
}

func warmConnectionStrategy(connectionsPerHost int) string {
	if connectionsPerHost <= 0 {
		return "DISABLED"
	}
	return "PER_HOST_PARALLEL"
}

func runCreateConversationPhase(ctx context.Context, client *http.Client, baseURLs []string, config benchmarkConfig) phaseReport {
	phase, firstErr := runPhase("createConversation", config.Concurrency, config.Operations, func(_ int, opIndex int) (operationResult, error) {
		return createConversation(ctx, client, baseURLForOperation(baseURLs, opIndex), config.AgentAPIKey, opIndex)
	})
	if firstErr != nil {
		phase.FirstError = firstErr.Error()
	}
	return phase
}

type operationResult struct {
	serverTimings map[string]time.Duration
}

func runPhase(
	name string,
	concurrency int,
	operations int,
	workerFunc func(workerID int, opIndex int) (operationResult, error),
) (phaseReport, error) {
	latencies := make([]time.Duration, operations)
	serverTimings := make([]map[string]time.Duration, operations)
	jobs := make(chan int)
	var errorsCount int64
	var firstErr error
	var firstErrMu sync.Mutex
	var wg sync.WaitGroup
	start := time.Now()

	for worker := 0; worker < concurrency; worker++ {
		workerID := worker
		wg.Add(1)
		go func() {
			defer wg.Done()
			for opIndex := range jobs {
				opStart := time.Now()
				result, err := workerFunc(workerID, opIndex)
				if err != nil {
					atomic.AddInt64(&errorsCount, 1)
					firstErrMu.Lock()
					if firstErr == nil {
						firstErr = err
					}
					firstErrMu.Unlock()
				}
				if len(result.serverTimings) > 0 {
					serverTimings[opIndex] = result.serverTimings
				}
				latencies[opIndex] = time.Since(opStart)
			}
		}()
	}
	for opIndex := 0; opIndex < operations; opIndex++ {
		jobs <- opIndex
	}
	close(jobs)
	wg.Wait()

	return buildPhaseReport(name, latencies, observedTimings(serverTimings), errorsCount, time.Since(start)), firstErr
}

func buildPhaseReport(
	name string,
	latencies []time.Duration,
	serverTimings map[string][]time.Duration,
	errorsCount int64,
	duration time.Duration,
) phaseReport {
	seconds := duration.Seconds()
	rps := 0.0
	if seconds > 0 {
		rps = roundFloat(float64(len(latencies)) / seconds)
	}
	report := phaseReport{
		Name:       name,
		Operations: len(latencies),
		Errors:     errorsCount,
		RPS:        rps,
		LatencyMS:  summarizeLatencies(latencies),
	}
	if len(serverTimings) > 0 {
		report.ServerTimingBreakdownMS = map[string]latencySummary{}
		report.ServerTimingBreakdownSamples = map[string]int{}
		for name, values := range serverTimings {
			report.ServerTimingBreakdownMS[name] = summarizeLatencies(values)
			report.ServerTimingBreakdownSamples[name] = len(values)
		}
		if values := serverTimings["app"]; len(values) > 0 {
			summary := summarizeLatencies(values)
			report.ServerTimingMS = &summary
			report.ServerTimingSamples = len(values)
		}
	} else {
		report.ServerTimingBreakdownMS = nil
		report.ServerTimingBreakdownSamples = nil
	}
	if report.ServerTimingMS == nil && len(serverTimings["app"]) > 0 {
		summary := summarizeLatencies(serverTimings["app"])
		report.ServerTimingMS = &summary
		report.ServerTimingSamples = len(serverTimings["app"])
	}
	return report
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

func createConversation(ctx context.Context, client *http.Client, baseURL string, agentAPIKey string, opIndex int) (operationResult, error) {
	body := map[string]any{
		"title": fmt.Sprintf("bench conversation %d", opIndex),
		"settings": map[string]any{
			"fusionMode": "balanced",
			"source":     "httpbench",
		},
	}
	return doJSON(ctx, client, http.MethodPost, baseURL+"/v1/research/conversations", agentAPIKey, body, http.StatusCreated)
}

func doJSON(ctx context.Context, client *http.Client, method string, endpoint string, agentAPIKey string, payload any, expectedStatus int) (operationResult, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return operationResult{}, err
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(data))
	if err != nil {
		return operationResult{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	if agentAPIKey != "" {
		request.Header.Set("X-Agent-Api-Key", agentAPIKey)
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
	_, _ = io.Copy(io.Discard, response.Body)
	return result, nil
}

func operationResultFromResponse(response *http.Response) operationResult {
	timings := parseServerTimingDurations(response.Header.Get("Server-Timing"))
	if len(timings) == 0 {
		return operationResult{}
	}
	return operationResult{serverTimings: timings}
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
		return nil, errors.New("base-url or CONVERSATION_HTTP_BENCHMARK_BASE_URL is required")
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

func observedTimings(values []map[string]time.Duration) map[string][]time.Duration {
	timings := map[string][]time.Duration{}
	for _, metrics := range values {
		for name, value := range metrics {
			timings[name] = append(timings[name], value)
		}
	}
	return timings
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
