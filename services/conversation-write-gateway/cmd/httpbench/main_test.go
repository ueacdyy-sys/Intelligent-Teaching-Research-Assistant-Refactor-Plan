package main

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestLatencySummaryPercentiles(t *testing.T) {
	summary := summarizeLatencies([]time.Duration{
		10 * time.Millisecond,
		20 * time.Millisecond,
		30 * time.Millisecond,
		40 * time.Millisecond,
		50 * time.Millisecond,
	})

	if summary.MinMS != 10 || summary.P50MS != 30 || summary.P95MS != 50 || summary.P99MS != 50 || summary.MaxMS != 50 {
		t.Fatalf("summary = %#v", summary)
	}
	if summary.AvgMS != 30 {
		t.Fatalf("AvgMS = %v", summary.AvgMS)
	}
}

func TestBuildPhaseReport(t *testing.T) {
	phase := buildPhaseReport(
		"createConversation",
		[]time.Duration{10 * time.Millisecond, 10 * time.Millisecond},
		nil,
		0,
		200*time.Millisecond,
	)

	if phase.Name != "createConversation" || phase.Operations != 2 || phase.Errors != 0 || phase.RPS != 10 {
		t.Fatalf("phase = %#v", phase)
	}
}

func TestBuildPhaseReportIncludesServerTimingSummary(t *testing.T) {
	phase := buildPhaseReport(
		"createConversation",
		[]time.Duration{20 * time.Millisecond, 30 * time.Millisecond},
		map[string][]time.Duration{
			"app": {4 * time.Millisecond, 6 * time.Millisecond},
		},
		0,
		100*time.Millisecond,
	)

	if phase.ServerTimingMS == nil {
		t.Fatal("ServerTimingMS is nil")
	}
	if phase.ServerTimingMS.P95MS != 6 {
		t.Fatalf("ServerTimingMS.P95MS = %v want 6", phase.ServerTimingMS.P95MS)
	}
	if phase.ServerTimingSamples != 2 {
		t.Fatalf("ServerTimingSamples = %d want 2", phase.ServerTimingSamples)
	}
}

func TestBuildPhaseReportIncludesServerTimingBreakdown(t *testing.T) {
	phase := buildPhaseReport(
		"createConversation",
		[]time.Duration{20 * time.Millisecond, 30 * time.Millisecond},
		map[string][]time.Duration{
			"app":        {12 * time.Millisecond, 14 * time.Millisecond},
			"db.acquire": {2 * time.Millisecond, 3 * time.Millisecond},
			"db.insert":  {7 * time.Millisecond, 8 * time.Millisecond},
		},
		0,
		100*time.Millisecond,
	)

	if phase.ServerTimingBreakdownMS["db.acquire"].P95MS != 3 {
		t.Fatalf("db.acquire P95 = %v want 3", phase.ServerTimingBreakdownMS["db.acquire"].P95MS)
	}
	if phase.ServerTimingBreakdownSamples["db.insert"] != 2 {
		t.Fatalf("db.insert samples = %d want 2", phase.ServerTimingBreakdownSamples["db.insert"])
	}
	if phase.ServerTimingMS == nil || phase.ServerTimingMS.P95MS != 14 {
		t.Fatalf("app ServerTimingMS = %#v want P95 14", phase.ServerTimingMS)
	}
}

func TestParseServerTimingDurations(t *testing.T) {
	got := parseServerTimingDurations(`db.acquire;dur=7.2, app;dur=12.34, db.insert;dur=5`)
	if len(got) != 3 {
		t.Fatalf("timings = %#v want 3 metrics", got)
	}
	if got["app"] != 12340*time.Microsecond {
		t.Fatalf("app duration = %s want 12.34ms", got["app"])
	}
	if got["db.acquire"] != 7200*time.Microsecond {
		t.Fatalf("db.acquire duration = %s want 7.2ms", got["db.acquire"])
	}
}

func TestParseBaseURLs(t *testing.T) {
	got, err := parseBaseURLs("http://127.0.0.1:18080, http://127.0.0.1:18081/")
	if err != nil {
		t.Fatalf("parseBaseURLs() error = %v", err)
	}
	want := []string{"http://127.0.0.1:18080", "http://127.0.0.1:18081"}

	if len(got) != len(want) {
		t.Fatalf("base URLs = %#v want %#v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("base URL %d = %q want %q", index, got[index], want[index])
		}
	}
}

func TestBuildHTTPClientReportsTransportProfile(t *testing.T) {
	config := benchmarkConfig{
		Concurrency:            800,
		MaxConnsPerHost:        200,
		WarmConnectionsPerHost: 200,
		WarmConnectionRetries:  3,
	}

	_, profile := buildHTTPClient(config, 4)

	if profile.MaxConnsPerHost != 200 {
		t.Fatalf("MaxConnsPerHost = %d want 200", profile.MaxConnsPerHost)
	}
	if profile.WarmConnectionsTotal != 800 {
		t.Fatalf("WarmConnectionsTotal = %d want 800", profile.WarmConnectionsTotal)
	}
	if profile.WarmConnectionStrategy != "PER_HOST_PARALLEL" {
		t.Fatalf("WarmConnectionStrategy = %q want PER_HOST_PARALLEL", profile.WarmConnectionStrategy)
	}
	if profile.WarmConnectionRetries != 3 {
		t.Fatalf("WarmConnectionRetries = %d want 3", profile.WarmConnectionRetries)
	}
	if profile.MaxIdleConns < 800 || profile.MaxIdleConnsPerHost < 800 {
		t.Fatalf("idle connection profile is too small: %#v", profile)
	}
}

func TestWarmHTTPConnectionsUsesPerHostParallelStrategy(t *testing.T) {
	baseURLs := []string{"http://gateway-a.test", "http://gateway-b.test"}
	var mu sync.Mutex
	hostActive := map[string]int{}
	maxDistinctActiveHosts := 0
	callsByHost := map[string]int{}
	release := make(chan struct{})

	requester := func(_ context.Context, baseURL string) error {
		mu.Lock()
		hostActive[baseURL]++
		callsByHost[baseURL]++
		distinctActiveHosts := 0
		for _, active := range hostActive {
			if active > 0 {
				distinctActiveHosts++
			}
		}
		if distinctActiveHosts > maxDistinctActiveHosts {
			maxDistinctActiveHosts = distinctActiveHosts
		}
		mu.Unlock()

		<-release

		mu.Lock()
		hostActive[baseURL]--
		mu.Unlock()
		return nil
	}

	done := make(chan error, 1)
	go func() {
		done <- warmHTTPConnectionsWithRequester(context.Background(), baseURLs, 3, 0, requester)
	}()

	waitForWarmCalls(t, &mu, callsByHost, baseURLs[0], 3)
	assertNoWarmCalls(t, &mu, callsByHost, baseURLs[1])
	for index := 0; index < 3; index++ {
		release <- struct{}{}
	}

	waitForWarmCalls(t, &mu, callsByHost, baseURLs[1], 3)
	for index := 0; index < 3; index++ {
		release <- struct{}{}
	}

	if err := <-done; err != nil {
		t.Fatalf("warmHTTPConnectionsWithRequester() error = %v", err)
	}
	if maxDistinctActiveHosts != 1 {
		t.Fatalf("maxDistinctActiveHosts = %d want 1", maxDistinctActiveHosts)
	}
}

func TestWarmHTTPConnectionsRetriesTransientRefusals(t *testing.T) {
	baseURLs := []string{"http://gateway-a.test"}
	var mu sync.Mutex
	calls := 0
	failuresRemaining := 3

	requester := func(_ context.Context, _ string) error {
		mu.Lock()
		defer mu.Unlock()
		calls++
		if failuresRemaining > 0 {
			failuresRemaining--
			return context.Canceled
		}
		return nil
	}

	err := warmHTTPConnectionsWithRequester(context.Background(), baseURLs, 3, 3, requester)
	if err != nil {
		t.Fatalf("warmHTTPConnectionsWithRequester() error = %v", err)
	}
	if calls != 6 {
		t.Fatalf("calls = %d want 6", calls)
	}
}

func TestReportStatusFromErrors(t *testing.T) {
	if got := reportStatus(0); got != "PASSED" {
		t.Fatalf("reportStatus(0) = %q", got)
	}
	if got := reportStatus(1); got != "FAILED" {
		t.Fatalf("reportStatus(1) = %q", got)
	}
}

func waitForWarmCalls(
	t *testing.T,
	mu *sync.Mutex,
	callsByHost map[string]int,
	baseURL string,
	want int,
) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		mu.Lock()
		got := callsByHost[baseURL]
		mu.Unlock()
		if got == want {
			return
		}
		time.Sleep(time.Millisecond)
	}
	mu.Lock()
	got := callsByHost[baseURL]
	mu.Unlock()
	t.Fatalf("warm calls for %s = %d want %d", baseURL, got, want)
}

func assertNoWarmCalls(t *testing.T, mu *sync.Mutex, callsByHost map[string]int, baseURL string) {
	t.Helper()
	mu.Lock()
	got := callsByHost[baseURL]
	mu.Unlock()
	if got != 0 {
		t.Fatalf("warm calls for %s = %d want 0 before previous host releases", baseURL, got)
	}
}
