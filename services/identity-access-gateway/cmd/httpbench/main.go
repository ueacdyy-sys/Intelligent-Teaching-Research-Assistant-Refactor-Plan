package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
)

type benchmarkConfig struct {
	BaseURL                   string
	OutPath                   string
	Concurrency               int
	OperationsPerPhase        int
	Timeout                   time.Duration
	MaxConnsPerHost           int
	WarmConnectionsPerHost    int
	WarmupOperations          int
	GatewayDiagnosticsBaseURL string
	GatewayDiagnosticsSecret  string
}

type benchmarkReport struct {
	GeneratedAt                     string                                     `json:"generatedAt"`
	BenchmarkKind                   string                                     `json:"benchmarkKind"`
	WorkloadType                    string                                     `json:"workloadType"`
	Status                          string                                     `json:"status"`
	BaseURL                         string                                     `json:"baseUrl"`
	GatewayCount                    int                                        `json:"gatewayCount"`
	GatewayBaseURLs                 []string                                   `json:"gatewayBaseUrls"`
	LoadBalancing                   string                                     `json:"loadBalancingStrategy"`
	TransportProfile                benchmarkTransportProfile                  `json:"transportProfile"`
	WarmupOperations                int                                        `json:"warmupOperations"`
	Concurrency                     int                                        `json:"concurrency"`
	OperationsPerPhase              int                                        `json:"operationsPerPhase"`
	TotalDurationMS                 float64                                    `json:"totalDurationMs"`
	Phases                          map[string]phaseReport                     `json:"phases"`
	GatewayDatabasePhaseDiagnostics map[string]gatewayDatabasePhaseDiagnostics `json:"gatewayDatabasePhaseDiagnostics,omitempty"`
}

type benchmarkTransportProfile struct {
	MaxIdleConns           int `json:"maxIdleConns"`
	MaxIdleConnsPerHost    int `json:"maxIdleConnsPerHost"`
	MaxConnsPerHost        int `json:"maxConnsPerHost"`
	WarmConnectionsPerHost int `json:"warmConnectionsPerHost"`
	WarmConnectionsTotal   int `json:"warmConnectionsTotal"`
}

type phaseReport struct {
	Name                         string                              `json:"name"`
	Operations                   int                                 `json:"operations"`
	Errors                       int64                               `json:"errors"`
	RPS                          float64                             `json:"rps"`
	LatencyMS                    latencySummary                      `json:"latencyMs"`
	ServerTimingMS               *latencySummary                     `json:"serverTimingMs,omitempty"`
	ServerTimingSamples          int                                 `json:"serverTimingSamples,omitempty"`
	ServerTimingBreakdownMS      map[string]latencySummary           `json:"serverTimingBreakdownMs,omitempty"`
	ServerTimingBreakdownSamples map[string]int                      `json:"serverTimingBreakdownSamples,omitempty"`
	ClientServerGapMS            *latencySummary                     `json:"clientServerGapMs,omitempty"`
	ClientServerGapSamples       int                                 `json:"clientServerGapSamples,omitempty"`
	StepLatencyMS                map[string]latencySummary           `json:"stepLatencyMs,omitempty"`
	StepLatencyAttribution       *stepLatencyAttribution             `json:"stepLatencyAttribution,omitempty"`
	StepOperationAttribution     map[string]stepOperationAttribution `json:"stepOperationAttribution,omitempty"`
}

type latencySummary struct {
	MinMS float64 `json:"min"`
	AvgMS float64 `json:"avg"`
	P50MS float64 `json:"p50"`
	P95MS float64 `json:"p95"`
	P99MS float64 `json:"p99"`
	MaxMS float64 `json:"max"`
}

type stepLatencyAttribution struct {
	SlowestStep      string  `json:"slowestStep"`
	SlowestStepP99MS float64 `json:"slowestStepP99Ms"`
	PhaseP99MS       float64 `json:"phaseP99Ms"`
	StepP99SumMS     float64 `json:"stepP99SumMs"`
	P99ResidualMS    float64 `json:"p99ResidualMs"`
	PhaseAvgMS       float64 `json:"phaseAvgMs"`
	StepAvgSumMS     float64 `json:"stepAvgSumMs"`
	AvgResidualMS    float64 `json:"avgResidualMs"`
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

type operationResult struct {
	serverTimings map[string]time.Duration
}

func (result *operationResult) merge(other operationResult) {
	if len(other.serverTimings) == 0 {
		return
	}
	if result.serverTimings == nil {
		result.serverTimings = map[string]time.Duration{}
	}
	for name, duration := range other.serverTimings {
		result.serverTimings[name] += duration
	}
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
	flag.IntVar(&config.WarmupOperations, "warmup-operations", 0, "optional unmeasured identity workflow operations before benchmark phases")
	flag.StringVar(&config.GatewayDiagnosticsBaseURL, "gateway-diagnostics-base-url", "", "optional comma-separated gateway base URLs for internal DB diagnostics")
	flag.StringVar(&config.GatewayDiagnosticsSecret, "gateway-diagnostics-secret", "", "optional internal diagnostics secret for phase DB diagnostics")
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
	if config.WarmupOperations < 0 {
		return errors.New("warmup-operations must be zero or positive")
	}
	baseURLs, err := parseBaseURLs(config.BaseURL)
	if err != nil {
		return err
	}
	diagnosticsCollector, err := newGatewayDatabaseDiagnosticsCollector(config)
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
	if err := warmIdentityWorkload(ctx, client, baseURLs, config); err != nil {
		return err
	}

	start := time.Now()
	loginPhase, err := runPasswordLoginPhase(ctx, client, baseURLs, config, diagnosticsCollector)
	if err != nil {
		return err
	}
	lookupPhase, err := runPrincipalLookupPhase(ctx, client, baseURLs, config, diagnosticsCollector)
	if err != nil {
		return err
	}
	refreshPhase, err := runRefreshRotationPhase(ctx, client, baseURLs, config, diagnosticsCollector)
	if err != nil {
		return err
	}
	revokePhase, err := runRevokeCyclePhase(ctx, client, baseURLs, config, diagnosticsCollector)
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
		WarmupOperations:   config.WarmupOperations,
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
	if diagnosticsCollector != nil && len(diagnosticsCollector.phases) > 0 {
		report.GatewayDatabasePhaseDiagnostics = diagnosticsCollector.phases
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

func warmIdentityWorkload(ctx context.Context, client *http.Client, baseURLs []string, config benchmarkConfig) error {
	if config.WarmupOperations <= 0 {
		return nil
	}
	jobs := make(chan int)
	errs := make(chan error, config.WarmupOperations)
	var wg sync.WaitGroup
	workers := minInt(maxInt(1, config.Concurrency), config.WarmupOperations)
	for worker := 0; worker < workers; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for opIndex := range jobs {
				if err := warmIdentityOperation(ctx, client, baseURLs, opIndex); err != nil {
					errs <- err
				}
			}
		}()
	}
	for opIndex := 0; opIndex < config.WarmupOperations; opIndex++ {
		jobs <- opIndex
	}
	close(jobs)
	wg.Wait()
	close(errs)
	for err := range errs {
		return fmt.Errorf("warm identity workflow: %w", err)
	}
	return nil
}

func warmIdentityOperation(ctx context.Context, client *http.Client, baseURLs []string, opIndex int) error {
	baseURL := baseURLForOperation(baseURLs, opIndex)
	session, _, err := login(
		ctx,
		client,
		baseURL,
		fmt.Sprintf("teacher-warmup-%d@example.com", opIndex),
		"TEACHER",
		"DESKTOP_TEACHER",
	)
	if err != nil {
		return err
	}
	if _, err := getPrincipal(ctx, client, baseURL, session.AccessToken); err != nil {
		return err
	}
	refreshed, _, err := refreshSession(ctx, client, baseURL, session.RefreshToken)
	if err != nil {
		return err
	}
	if _, err := revokeSession(ctx, client, baseURL, refreshed); err != nil {
		return err
	}
	return nil
}

func runPasswordLoginPhase(ctx context.Context, client *http.Client, baseURLs []string, config benchmarkConfig, diagnostics *gatewayDatabaseDiagnosticsCollector) (phaseReport, error) {
	var sessionsMu sync.Mutex
	sessions := make([]sessionState, 0, config.OperationsPerPhase)
	diagnosticsBefore := diagnostics.collect(ctx)
	phase, firstErr := runPhase("passwordLogin", config.Concurrency, config.OperationsPerPhase, func(_ int, opIndex int) (operationResult, error) {
		session, result, err := login(ctx, client, baseURLForOperation(baseURLs, opIndex), fmt.Sprintf("teacher-login-%d@example.com", opIndex), "TEACHER", "DESKTOP_TEACHER")
		if err != nil {
			return result, err
		}
		sessionsMu.Lock()
		sessions = append(sessions, session)
		sessionsMu.Unlock()
		return result, nil
	})
	diagnosticsAfter := diagnostics.collect(ctx)
	diagnostics.recordPhase("passwordLogin", diagnosticsBefore, diagnosticsAfter)
	cleanupByRevoke(ctx, client, baseURLs, sessions)
	return phase, phaseError("passwordLogin", phase, firstErr)
}

func runPrincipalLookupPhase(ctx context.Context, client *http.Client, baseURLs []string, config benchmarkConfig, diagnostics *gatewayDatabaseDiagnosticsCollector) (phaseReport, error) {
	tokenCount := maxInt(config.Concurrency*2, 128)
	sessions := make([]sessionState, tokenCount)
	for index := 0; index < tokenCount; index++ {
		session, _, err := login(ctx, client, baseURLForOperation(baseURLs, index), fmt.Sprintf("teacher-lookup-%d@example.com", index), "TEACHER", "DESKTOP_TEACHER")
		if err != nil {
			return phaseReport{}, fmt.Errorf("seed lookup session: %w", err)
		}
		sessions[index] = session
	}
	defer cleanupByRevoke(context.Background(), client, baseURLs, sessions)

	diagnosticsBefore := diagnostics.collect(ctx)
	phase, firstErr := runPhase("principalLookup", config.Concurrency, config.OperationsPerPhase, func(_ int, opIndex int) (operationResult, error) {
		return getPrincipal(ctx, client, baseURLForOperation(baseURLs, opIndex), sessions[opIndex%len(sessions)].AccessToken)
	})
	diagnosticsAfter := diagnostics.collect(ctx)
	diagnostics.recordPhase("principalLookup", diagnosticsBefore, diagnosticsAfter)
	return phase, phaseError("principalLookup", phase, firstErr)
}

func runRefreshRotationPhase(ctx context.Context, client *http.Client, baseURLs []string, config benchmarkConfig, diagnostics *gatewayDatabaseDiagnosticsCollector) (phaseReport, error) {
	states := make([]sessionState, config.Concurrency)
	for worker := range states {
		session, _, err := login(ctx, client, baseURLForOperation(baseURLs, worker), fmt.Sprintf("teacher-refresh-%d@example.com", worker), "TEACHER", "DESKTOP_RESEARCH")
		if err != nil {
			return phaseReport{}, fmt.Errorf("seed refresh session: %w", err)
		}
		states[worker] = session
	}
	defer cleanupByRevoke(context.Background(), client, baseURLs, states)

	diagnosticsBefore := diagnostics.collect(ctx)
	phase, firstErr := runPhase("refreshRotation", config.Concurrency, config.OperationsPerPhase, func(workerID int, _ int) (operationResult, error) {
		session, result, err := refreshSession(ctx, client, baseURLForOperation(baseURLs, workerID), states[workerID].RefreshToken)
		if err != nil {
			return result, err
		}
		states[workerID] = session
		return result, nil
	})
	diagnosticsAfter := diagnostics.collect(ctx)
	diagnostics.recordPhase("refreshRotation", diagnosticsBefore, diagnosticsAfter)
	return phase, phaseError("refreshRotation", phase, firstErr)
}

func runRevokeCyclePhase(ctx context.Context, client *http.Client, baseURLs []string, config benchmarkConfig, diagnostics *gatewayDatabaseDiagnosticsCollector) (phaseReport, error) {
	sessions, err := seedRevokeSessions(ctx, client, baseURLs, config.OperationsPerPhase, config.Concurrency)
	if err != nil {
		return phaseReport{}, err
	}
	stepLatencies := newStepLatencyRecorder(config.OperationsPerPhase, []string{"revoke", "revokedPrincipalLookup"})
	diagnosticsBefore := diagnostics.collect(ctx)
	phase, firstErr := runPhase("revokeCycle", config.Concurrency, config.OperationsPerPhase, func(_ int, opIndex int) (operationResult, error) {
		baseURL := baseURLForOperation(baseURLs, opIndex)
		combined := operationResult{}
		session := sessions[opIndex]

		stepStart := time.Now()
		result, err := revokeSession(ctx, client, baseURL, session)
		combined.merge(result)
		if err != nil {
			stepLatencies.record("revoke", opIndex, time.Since(stepStart))
			return combined, err
		}
		stepLatencies.record("revoke", opIndex, time.Since(stepStart))

		stepStart = time.Now()
		status, result, err := getPrincipalStatus(ctx, client, baseURL, session.AccessToken)
		combined.merge(result)
		stepLatencies.record("revokedPrincipalLookup", opIndex, time.Since(stepStart))
		if err != nil {
			return combined, err
		}
		if status != http.StatusUnauthorized {
			return combined, fmt.Errorf("revoked principal lookup status = %d", status)
		}
		return combined, nil
	})
	diagnosticsAfter := diagnostics.collect(ctx)
	phaseDiagnostics, hasDiagnostics := diagnostics.recordPhase("revokeCycle", diagnosticsBefore, diagnosticsAfter)
	phase.StepLatencyMS = stepLatencies.summarize()
	phase.StepLatencyAttribution = buildStepLatencyAttribution(phase.LatencyMS, phase.StepLatencyMS)
	if hasDiagnostics {
		phase.StepOperationAttribution = buildRevokeCycleStepOperationAttribution(
			phase.StepLatencyMS,
			phaseDiagnostics,
		)
	}
	return phase, phaseError("revokeCycle", phase, firstErr)
}

func seedRevokeSessions(ctx context.Context, client *http.Client, baseURLs []string, operations int, concurrency int) ([]sessionState, error) {
	sessions := make([]sessionState, operations)
	jobs := make(chan int)
	var firstErr error
	var firstErrMu sync.Mutex
	var wg sync.WaitGroup
	workers := minInt(maxInt(1, concurrency), operations)
	for worker := 0; worker < workers; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for index := range jobs {
				session, _, err := login(ctx, client, baseURLForOperation(baseURLs, index), fmt.Sprintf("student-revoke-seed-%d", index), "STUDENT", "STUDENT_APP")
				if err != nil {
					firstErrMu.Lock()
					if firstErr == nil {
						firstErr = err
					}
					firstErrMu.Unlock()
					continue
				}
				sessions[index] = session
			}
		}()
	}
	for index := 0; index < operations; index++ {
		jobs <- index
	}
	close(jobs)
	wg.Wait()
	if firstErr != nil {
		return sessions, fmt.Errorf("seed revoke session: %w", firstErr)
	}
	return sessions, nil
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

	return buildPhaseReport(name, latencies, serverTimings, errorsCount, time.Since(start)), firstErr
}

func buildPhaseReport(
	name string,
	latencies []time.Duration,
	serverTimings []map[string]time.Duration,
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
	serverTimingBreakdown := observedTimings(serverTimings)
	if len(serverTimingBreakdown) > 0 {
		report.ServerTimingBreakdownMS = map[string]latencySummary{}
		report.ServerTimingBreakdownSamples = map[string]int{}
		for metricName, values := range serverTimingBreakdown {
			report.ServerTimingBreakdownMS[metricName] = summarizeLatencies(values)
			report.ServerTimingBreakdownSamples[metricName] = len(values)
		}
		if values := serverTimingBreakdown["app"]; len(values) > 0 {
			summary := summarizeLatencies(values)
			report.ServerTimingMS = &summary
			report.ServerTimingSamples = len(values)
		}
	}
	if gaps := observedClientServerGaps(latencies, serverTimings); len(gaps) > 0 {
		summary := summarizeLatencies(gaps)
		report.ClientServerGapMS = &summary
		report.ClientServerGapSamples = len(gaps)
	}
	return report
}

func buildPhaseReportWithStepLatencies(name string, latencies []time.Duration, errorsCount int64, duration time.Duration, stepLatencies map[string][]time.Duration) phaseReport {
	phase := buildPhaseReport(name, latencies, nil, errorsCount, duration)
	if len(stepLatencies) == 0 {
		return phase
	}
	phase.StepLatencyMS = make(map[string]latencySummary, len(stepLatencies))
	for stepName, latencies := range stepLatencies {
		phase.StepLatencyMS[stepName] = summarizeLatencies(latencies)
	}
	phase.StepLatencyAttribution = buildStepLatencyAttribution(phase.LatencyMS, phase.StepLatencyMS)
	return phase
}

func buildStepLatencyAttribution(phaseLatency latencySummary, stepLatencies map[string]latencySummary) *stepLatencyAttribution {
	if len(stepLatencies) == 0 {
		return nil
	}
	attribution := stepLatencyAttribution{
		PhaseP99MS: phaseLatency.P99MS,
		PhaseAvgMS: phaseLatency.AvgMS,
	}
	for stepName, latency := range stepLatencies {
		if attribution.SlowestStep == "" || latency.P99MS > attribution.SlowestStepP99MS {
			attribution.SlowestStep = stepName
			attribution.SlowestStepP99MS = latency.P99MS
		}
		attribution.StepP99SumMS += latency.P99MS
		attribution.StepAvgSumMS += latency.AvgMS
	}
	attribution.StepP99SumMS = roundFloat(attribution.StepP99SumMS)
	attribution.StepAvgSumMS = roundFloat(attribution.StepAvgSumMS)
	attribution.P99ResidualMS = roundFloat(phaseLatency.P99MS - attribution.StepP99SumMS)
	attribution.AvgResidualMS = roundFloat(phaseLatency.AvgMS - attribution.StepAvgSumMS)
	return &attribution
}
