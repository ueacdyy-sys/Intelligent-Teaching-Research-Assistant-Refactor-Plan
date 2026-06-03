package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
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
	ClientTrace            bool
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
	ClientTrace      bool                      `json:"clientTraceEnabled"`
	Concurrency      int                       `json:"concurrency"`
	Operations       int                       `json:"operationsPerPhase"`
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
	ClientServerGapMS            *latencySummary           `json:"clientServerGapMs,omitempty"`
	ClientServerGapSamples       int                       `json:"clientServerGapSamples,omitempty"`
	ClientTraceBreakdownMS       map[string]latencySummary `json:"clientTraceBreakdownMs,omitempty"`
	ClientTraceBreakdownSamples  map[string]int            `json:"clientTraceBreakdownSamples,omitempty"`
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
	flag.StringVar(&config.BaseURL, "base-url", os.Getenv("TEACHING_HTTP_BENCHMARK_BASE_URL"), "teaching archive gateway base URL or comma-separated URLs")
	flag.StringVar(&config.AgentAPIKey, "agent-api-key", getenv("AGENT_API_KEY", "ueacd"), "agent API key sent as X-Agent-Api-Key")
	flag.StringVar(&config.OutPath, "out", "", "optional JSON report path")
	flag.IntVar(&config.Concurrency, "concurrency", 64, "number of concurrent workers")
	flag.IntVar(&config.Operations, "operations", 500, "operations per Teaching phase to run")
	flag.DurationVar(&config.Timeout, "timeout", 60*time.Second, "benchmark timeout")
	flag.IntVar(&config.MaxConnsPerHost, "max-conns-per-host", 0, "optional HTTP transport max connections per gateway host")
	flag.IntVar(&config.WarmConnectionsPerHost, "warm-connections-per-host", 0, "optional keep-alive connections to prewarm per gateway host")
	flag.IntVar(&config.WarmConnectionRetries, "warm-connection-retries", 3, "warm-up retries per connection after transient listener refusal")
	flag.BoolVar(&config.ClientTrace, "client-trace", false, "capture per-request client-side httptrace timings")
	flag.Parse()
	return config
}

func run(config benchmarkConfig) error {
	if config.BaseURL == "" {
		return errors.New("base-url or TEACHING_HTTP_BENCHMARK_BASE_URL is required")
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
	createPhase, archiveItemIDs := runCreateArchiveItemPhase(ctx, client, baseURLs, config)
	createQuizSubmissionPhase := runCreateQuizSubmissionPhase(ctx, client, baseURLs, config, archiveItemIDs)
	listArchiveItemsPhase := runListArchiveItemsPhase(ctx, client, baseURLs, config)
	totalErrors := createPhase.Errors + createQuizSubmissionPhase.Errors + listArchiveItemsPhase.Errors
	report := benchmarkReport{
		GeneratedAt:      time.Now().UTC().Format(time.RFC3339Nano),
		BenchmarkKind:    "teaching_archive_gateway",
		WorkloadType:     "HTTP_BENCHMARK",
		Status:           reportStatus(totalErrors),
		BaseURL:          maskURL(baseURLs[0]),
		GatewayCount:     len(baseURLs),
		GatewayBaseURLs:  maskURLs(baseURLs),
		LoadBalancing:    loadBalancingStrategy(baseURLs),
		TransportProfile: transportProfile,
		ClientTrace:      config.ClientTrace,
		Concurrency:      config.Concurrency,
		Operations:       config.Operations,
		TotalDurationMS:  roundMillis(time.Since(start)),
		Phases: map[string]phaseReport{
			"createArchiveItem":    createPhase,
			"createQuizSubmission": createQuizSubmissionPhase,
			"listArchiveItems":     listArchiveItemsPhase,
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
	if totalErrors > 0 {
		return fmt.Errorf("teaching archive benchmark failed with %d errors", totalErrors)
	}
	return nil
}
