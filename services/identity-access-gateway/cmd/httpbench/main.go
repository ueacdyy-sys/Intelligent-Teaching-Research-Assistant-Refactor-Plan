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
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type benchmarkConfig struct {
	BaseURL                string
	OutPath                string
	Concurrency            int
	OperationsPerPhase     int
	Timeout                time.Duration
	MaxConnsPerHost        int
	WarmConnectionsPerHost int
}

type benchmarkReport struct {
	GeneratedAt        string                    `json:"generatedAt"`
	BenchmarkKind      string                    `json:"benchmarkKind"`
	WorkloadType       string                    `json:"workloadType"`
	Status             string                    `json:"status"`
	BaseURL            string                    `json:"baseUrl"`
	GatewayCount       int                       `json:"gatewayCount"`
	GatewayBaseURLs    []string                  `json:"gatewayBaseUrls"`
	LoadBalancing      string                    `json:"loadBalancingStrategy"`
	TransportProfile   benchmarkTransportProfile `json:"transportProfile"`
	Concurrency        int                       `json:"concurrency"`
	OperationsPerPhase int                       `json:"operationsPerPhase"`
	TotalDurationMS    float64                   `json:"totalDurationMs"`
	Phases             map[string]phaseReport    `json:"phases"`
}

type benchmarkTransportProfile struct {
	MaxIdleConns           int `json:"maxIdleConns"`
	MaxIdleConnsPerHost    int `json:"maxIdleConnsPerHost"`
	MaxConnsPerHost        int `json:"maxConnsPerHost"`
	WarmConnectionsPerHost int `json:"warmConnectionsPerHost"`
	WarmConnectionsTotal   int `json:"warmConnectionsTotal"`
}

type phaseReport struct {
	Name       string         `json:"name"`
	Operations int            `json:"operations"`
	Errors     int64          `json:"errors"`
	RPS        float64        `json:"rps"`
	LatencyMS  latencySummary `json:"latencyMs"`
}

type latencySummary struct {
	MinMS float64 `json:"min"`
	AvgMS float64 `json:"avg"`
	P50MS float64 `json:"p50"`
	P95MS float64 `json:"p95"`
	P99MS float64 `json:"p99"`
	MaxMS float64 `json:"max"`
}

type sessionResponse struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	Principal    struct {
		SessionID string `json:"sessionId"`
	} `json:"principal"`
}

type sessionState struct {
	AccessToken  string
	RefreshToken string
	SessionID    string
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
	flag.StringVar(&config.BaseURL, "base-url", os.Getenv("IDENTITY_HTTP_BENCHMARK_BASE_URL"), "Identity gateway base URL")
	flag.StringVar(&config.OutPath, "out", "", "optional JSON report path")
	flag.IntVar(&config.Concurrency, "concurrency", 64, "number of concurrent workers")
	flag.IntVar(&config.OperationsPerPhase, "operations", 500, "operations to run for each phase")
	flag.DurationVar(&config.Timeout, "timeout", 60*time.Second, "benchmark timeout")
	flag.IntVar(&config.MaxConnsPerHost, "max-conns-per-host", 0, "optional HTTP transport max connections per gateway host")
	flag.IntVar(&config.WarmConnectionsPerHost, "warm-connections-per-host", 0, "optional keep-alive connections to prewarm per gateway host")
	flag.Parse()
	return config
}

func run(config benchmarkConfig) error {
	if config.BaseURL == "" {
		return errors.New("base-url or IDENTITY_HTTP_BENCHMARK_BASE_URL is required")
	}
	if config.Concurrency < 1 {
		return errors.New("concurrency must be positive")
	}
	if config.OperationsPerPhase < 1 {
		return errors.New("operations must be positive")
	}
	if config.MaxConnsPerHost < 0 {
		return errors.New("max-conns-per-host must be zero or positive")
	}
	if config.WarmConnectionsPerHost < 0 {
		return errors.New("warm-connections-per-host must be zero or positive")
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
	if err := warmHTTPConnections(ctx, client, baseURLs, config.WarmConnectionsPerHost); err != nil {
		return err
	}

	start := time.Now()
	loginPhase, err := runPasswordLoginPhase(ctx, client, baseURLs, config)
	if err != nil {
		return err
	}
	lookupPhase, err := runPrincipalLookupPhase(ctx, client, baseURLs, config)
	if err != nil {
		return err
	}
	refreshPhase, err := runRefreshRotationPhase(ctx, client, baseURLs, config)
	if err != nil {
		return err
	}
	revokePhase, err := runRevokeCyclePhase(ctx, client, baseURLs, config)
	if err != nil {
		return err
	}

	report := benchmarkReport{
		GeneratedAt:        time.Now().UTC().Format(time.RFC3339Nano),
		BenchmarkKind:      "identity_http_gateway",
		WorkloadType:       "HTTP_BENCHMARK",
		Status:             "PASSED",
		BaseURL:            maskURL(baseURLs[0]),
		GatewayCount:       len(baseURLs),
		GatewayBaseURLs:    maskURLs(baseURLs),
		LoadBalancing:      loadBalancingStrategy(baseURLs),
		TransportProfile:   transportProfile,
		Concurrency:        config.Concurrency,
		OperationsPerPhase: config.OperationsPerPhase,
		TotalDurationMS:    roundMillis(time.Since(start)),
		Phases: map[string]phaseReport{
			"passwordLogin":   loginPhase,
			"principalLookup": lookupPhase,
			"refreshRotation": refreshPhase,
			"revokeCycle":     revokePhase,
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
	return nil
}

func buildHTTPClient(config benchmarkConfig, gatewayCount int) (*http.Client, benchmarkTransportProfile) {
	maxIdleConns := config.Concurrency * 4
	maxIdleConnsPerHost := config.Concurrency * 4
	warmConnectionsTotal := maxInt(0, config.WarmConnectionsPerHost) * maxInt(1, gatewayCount)
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
		}
}

func warmHTTPConnections(ctx context.Context, client *http.Client, baseURLs []string, connectionsPerHost int) error {
	if connectionsPerHost <= 0 {
		return nil
	}
	var wg sync.WaitGroup
	errs := make(chan error, len(baseURLs)*connectionsPerHost)
	start := make(chan struct{})
	for _, baseURL := range baseURLs {
		baseURL := baseURL
		for index := 0; index < connectionsPerHost; index++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-start
				if err := requestHealth(ctx, client, baseURL); err != nil {
					errs <- err
				}
			}()
		}
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		return fmt.Errorf("warm transport connections: %w", err)
	}
	return nil
}

func runPasswordLoginPhase(ctx context.Context, client *http.Client, baseURLs []string, config benchmarkConfig) (phaseReport, error) {
	var sessionsMu sync.Mutex
	sessions := make([]sessionState, 0, config.OperationsPerPhase)
	phase, firstErr := runPhase("passwordLogin", config.Concurrency, config.OperationsPerPhase, func(_ int, opIndex int) error {
		session, err := login(ctx, client, baseURLForOperation(baseURLs, opIndex), fmt.Sprintf("teacher-login-%d@example.com", opIndex), "TEACHER", "DESKTOP_TEACHER")
		if err != nil {
			return err
		}
		sessionsMu.Lock()
		sessions = append(sessions, session)
		sessionsMu.Unlock()
		return nil
	})
	cleanupByRevoke(ctx, client, baseURLs, sessions)
	return phase, phaseError("passwordLogin", phase, firstErr)
}

func runPrincipalLookupPhase(ctx context.Context, client *http.Client, baseURLs []string, config benchmarkConfig) (phaseReport, error) {
	tokenCount := maxInt(config.Concurrency*2, 128)
	sessions := make([]sessionState, tokenCount)
	for index := 0; index < tokenCount; index++ {
		session, err := login(ctx, client, baseURLForOperation(baseURLs, index), fmt.Sprintf("teacher-lookup-%d@example.com", index), "TEACHER", "DESKTOP_TEACHER")
		if err != nil {
			return phaseReport{}, fmt.Errorf("seed lookup session: %w", err)
		}
		sessions[index] = session
	}
	defer cleanupByRevoke(context.Background(), client, baseURLs, sessions)

	phase, firstErr := runPhase("principalLookup", config.Concurrency, config.OperationsPerPhase, func(_ int, opIndex int) error {
		return getPrincipal(ctx, client, baseURLForOperation(baseURLs, opIndex), sessions[opIndex%len(sessions)].AccessToken)
	})
	return phase, phaseError("principalLookup", phase, firstErr)
}

func runRefreshRotationPhase(ctx context.Context, client *http.Client, baseURLs []string, config benchmarkConfig) (phaseReport, error) {
	states := make([]sessionState, config.Concurrency)
	for worker := range states {
		session, err := login(ctx, client, baseURLForOperation(baseURLs, worker), fmt.Sprintf("teacher-refresh-%d@example.com", worker), "TEACHER", "DESKTOP_RESEARCH")
		if err != nil {
			return phaseReport{}, fmt.Errorf("seed refresh session: %w", err)
		}
		states[worker] = session
	}
	defer cleanupByRevoke(context.Background(), client, baseURLs, states)

	phase, firstErr := runPhase("refreshRotation", config.Concurrency, config.OperationsPerPhase, func(workerID int, _ int) error {
		session, err := refreshSession(ctx, client, baseURLForOperation(baseURLs, workerID), states[workerID].RefreshToken)
		if err != nil {
			return err
		}
		states[workerID] = session
		return nil
	})
	return phase, phaseError("refreshRotation", phase, firstErr)
}

func runRevokeCyclePhase(ctx context.Context, client *http.Client, baseURLs []string, config benchmarkConfig) (phaseReport, error) {
	phase, firstErr := runPhase("revokeCycle", config.Concurrency, config.OperationsPerPhase, func(_ int, opIndex int) error {
		baseURL := baseURLForOperation(baseURLs, opIndex)
		session, err := login(ctx, client, baseURL, fmt.Sprintf("student-revoke-%d", opIndex), "STUDENT", "STUDENT_APP")
		if err != nil {
			return err
		}
		if err := revokeSession(ctx, client, baseURL, session); err != nil {
			return err
		}
		status, err := getPrincipalStatus(ctx, client, baseURL, session.AccessToken)
		if err != nil {
			return err
		}
		if status != http.StatusUnauthorized {
			return fmt.Errorf("revoked principal lookup status = %d", status)
		}
		return nil
	})
	return phase, phaseError("revokeCycle", phase, firstErr)
}

func runPhase(name string, concurrency int, operations int, workerFunc func(workerID int, opIndex int) error) (phaseReport, error) {
	latencies := make([]time.Duration, operations)
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
				if err := workerFunc(workerID, opIndex); err != nil {
					atomic.AddInt64(&errorsCount, 1)
					firstErrMu.Lock()
					if firstErr == nil {
						firstErr = err
					}
					firstErrMu.Unlock()
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

	return buildPhaseReport(name, latencies, errorsCount, time.Since(start)), firstErr
}

func buildPhaseReport(name string, latencies []time.Duration, errorsCount int64, duration time.Duration) phaseReport {
	seconds := duration.Seconds()
	rps := 0.0
	if seconds > 0 {
		rps = roundFloat(float64(len(latencies)) / seconds)
	}
	return phaseReport{
		Name:       name,
		Operations: len(latencies),
		Errors:     errorsCount,
		RPS:        rps,
		LatencyMS:  summarizeLatencies(latencies),
	}
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

func login(ctx context.Context, client *http.Client, baseURL string, identifier string, role string, entryPoint string) (sessionState, error) {
	body := map[string]string{
		"identifier":    identifier,
		"password":      "ueacd",
		"requestedRole": role,
		"entryPoint":    entryPoint,
	}
	var response sessionResponse
	if err := doJSON(ctx, client, http.MethodPost, baseURL+"/v1/identity/sessions/password", "", body, http.StatusCreated, &response); err != nil {
		return sessionState{}, err
	}
	return sessionState{
		AccessToken:  response.AccessToken,
		RefreshToken: response.RefreshToken,
		SessionID:    response.Principal.SessionID,
	}, nil
}

func refreshSession(ctx context.Context, client *http.Client, baseURL string, refreshToken string) (sessionState, error) {
	var response sessionResponse
	if err := doJSON(ctx, client, http.MethodPost, baseURL+"/v1/identity/sessions/refresh", "", map[string]string{"refreshToken": refreshToken}, http.StatusOK, &response); err != nil {
		return sessionState{}, err
	}
	return sessionState{
		AccessToken:  response.AccessToken,
		RefreshToken: response.RefreshToken,
		SessionID:    response.Principal.SessionID,
	}, nil
}

func getPrincipal(ctx context.Context, client *http.Client, baseURL string, accessToken string) error {
	status, err := getPrincipalStatus(ctx, client, baseURL, accessToken)
	if err != nil {
		return err
	}
	if status != http.StatusOK {
		return fmt.Errorf("principal lookup status = %d", status)
	}
	return nil
}

func getPrincipalStatus(ctx context.Context, client *http.Client, baseURL string, accessToken string) (int, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/v1/identity/principal", nil)
	if err != nil {
		return 0, err
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	response, err := client.Do(request)
	if err != nil {
		return 0, err
	}
	_, _ = io.Copy(io.Discard, response.Body)
	_ = response.Body.Close()
	return response.StatusCode, nil
}

func revokeSession(ctx context.Context, client *http.Client, baseURL string, session sessionState) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodDelete, baseURL+"/v1/identity/sessions/"+url.PathEscape(session.SessionID), nil)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+session.AccessToken)
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	_, _ = io.Copy(io.Discard, response.Body)
	_ = response.Body.Close()
	if response.StatusCode != http.StatusNoContent && response.StatusCode != http.StatusUnauthorized {
		return fmt.Errorf("revoke status = %d", response.StatusCode)
	}
	return nil
}

func doJSON(ctx context.Context, client *http.Client, method string, endpoint string, bearer string, payload any, expectedStatus int, target any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(data))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		request.Header.Set("Authorization", "Bearer "+bearer)
	}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != expectedStatus {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 2048))
		return fmt.Errorf("%s %s status = %d body = %s", method, endpoint, response.StatusCode, string(body))
	}
	if target == nil {
		_, _ = io.Copy(io.Discard, response.Body)
		return nil
	}
	if err := json.NewDecoder(response.Body).Decode(target); err != nil {
		return err
	}
	return nil
}

func cleanupByRevoke(ctx context.Context, client *http.Client, baseURLs []string, sessions []sessionState) {
	for index, session := range sessions {
		if session.AccessToken == "" || session.SessionID == "" {
			continue
		}
		_ = revokeSession(ctx, client, baseURLForOperation(baseURLs, index), session)
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
