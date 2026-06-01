package main

import (
	"context"
	"net/http"
	"net/http/httptest"
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
		[]map[string]time.Duration{
			{"app": 4 * time.Millisecond},
			{"app": 6 * time.Millisecond},
		},
		nil,
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
		[]map[string]time.Duration{
			{
				"app":        12 * time.Millisecond,
				"db.acquire": 2 * time.Millisecond,
				"db.insert":  7 * time.Millisecond,
			},
			{
				"app":        14 * time.Millisecond,
				"db.acquire": 3 * time.Millisecond,
				"db.insert":  8 * time.Millisecond,
			},
		},
		nil,
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

func TestBuildPhaseReportIncludesClientServerGap(t *testing.T) {
	phase := buildPhaseReport(
		"createConversation",
		[]time.Duration{20 * time.Millisecond, 30 * time.Millisecond},
		[]map[string]time.Duration{
			{"app": 12 * time.Millisecond},
			{"app": 18 * time.Millisecond},
		},
		nil,
		0,
		100*time.Millisecond,
	)

	if phase.ClientServerGapMS == nil {
		t.Fatal("ClientServerGapMS is nil")
	}
	if phase.ClientServerGapMS.P95MS != 12 {
		t.Fatalf("ClientServerGapMS.P95MS = %v want 12", phase.ClientServerGapMS.P95MS)
	}
	if phase.ClientServerGapSamples != 2 {
		t.Fatalf("ClientServerGapSamples = %d want 2", phase.ClientServerGapSamples)
	}
}

func TestBuildPhaseReportIncludesClientTraceBreakdown(t *testing.T) {
	phase := buildPhaseReport(
		"createConversation",
		[]time.Duration{30 * time.Millisecond, 40 * time.Millisecond},
		[]map[string]time.Duration{
			{"app": 12 * time.Millisecond},
			{"app": 16 * time.Millisecond},
		},
		[]map[string]time.Duration{
			{
				"client.transport_wait":           4 * time.Millisecond,
				"client.first_response_byte_wait": 15 * time.Millisecond,
			},
			{
				"client.transport_wait":           7 * time.Millisecond,
				"client.first_response_byte_wait": 21 * time.Millisecond,
			},
		},
		0,
		100*time.Millisecond,
	)

	if phase.ClientTraceBreakdownMS["client.transport_wait"].P95MS != 7 {
		t.Fatalf("client.transport_wait P95 = %v want 7", phase.ClientTraceBreakdownMS["client.transport_wait"].P95MS)
	}
	if phase.ClientTraceBreakdownSamples["client.first_response_byte_wait"] != 2 {
		t.Fatalf("client.first_response_byte_wait samples = %d want 2", phase.ClientTraceBreakdownSamples["client.first_response_byte_wait"])
	}
	if phase.ClientTraceBreakdownMS["client.first_byte_app_gap"].P95MS != 5 {
		t.Fatalf("client.first_byte_app_gap P95 = %v want 5", phase.ClientTraceBreakdownMS["client.first_byte_app_gap"].P95MS)
	}
}

func TestClientRequestTraceDurations(t *testing.T) {
	start := time.Unix(100, 0)
	trace := clientRequestTrace{
		requestStart:         start,
		requestPrepared:      start.Add(2 * time.Millisecond),
		gotConn:              start.Add(5 * time.Millisecond),
		wroteRequest:         start.Add(7 * time.Millisecond),
		gotFirstResponseByte: start.Add(19 * time.Millisecond),
		responseClosed:       start.Add(23 * time.Millisecond),
	}

	got := trace.durations()

	assertDuration(t, got, "client.request_prepare", 2*time.Millisecond)
	assertDuration(t, got, "client.transport_wait", 3*time.Millisecond)
	assertDuration(t, got, "client.request_write", 2*time.Millisecond)
	assertDuration(t, got, "client.first_response_byte_wait", 12*time.Millisecond)
	assertDuration(t, got, "client.response_body_read", 4*time.Millisecond)
	assertDuration(t, got, "client.round_trip", 21*time.Millisecond)
}

func TestDoJSONCapturesClientTraceTimings(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("X-Agent-Api-Key") != "local-key" {
			http.Error(response, "missing local key", http.StatusUnauthorized)
			return
		}
		time.Sleep(2 * time.Millisecond)
		response.Header().Set("Server-Timing", "app;dur=1.5")
		response.WriteHeader(http.StatusCreated)
		_, _ = response.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(server.Close)

	result, err := doJSON(
		context.Background(),
		server.Client(),
		http.MethodPost,
		server.URL+"/v1/research/conversations",
		"local-key",
		map[string]string{"title": "bench"},
		http.StatusCreated,
		true,
	)

	if err != nil {
		t.Fatalf("doJSON() error = %v", err)
	}
	assertDuration(t, result.serverTimings, "app", 1500*time.Microsecond)
	if result.clientTraceTimings["client.round_trip"] <= 0 {
		t.Fatalf("client.round_trip = %s want positive", result.clientTraceTimings["client.round_trip"])
	}
	if result.clientTraceTimings["client.first_response_byte_wait"] <= 0 {
		t.Fatalf("client.first_response_byte_wait = %s want positive", result.clientTraceTimings["client.first_response_byte_wait"])
	}
}

func TestDoJSONSkipsClientTraceByDefault(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("Server-Timing", "app;dur=1.5")
		response.WriteHeader(http.StatusCreated)
		_, _ = response.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(server.Close)

	result, err := doJSON(
		context.Background(),
		server.Client(),
		http.MethodPost,
		server.URL+"/v1/research/conversations",
		"local-key",
		map[string]string{"title": "bench"},
		http.StatusCreated,
		false,
	)

	if err != nil {
		t.Fatalf("doJSON() error = %v", err)
	}
	assertDuration(t, result.serverTimings, "app", 1500*time.Microsecond)
	if len(result.clientTraceTimings) != 0 {
		t.Fatalf("clientTraceTimings = %#v want empty", result.clientTraceTimings)
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

func assertDuration(t *testing.T, got map[string]time.Duration, name string, want time.Duration) {
	t.Helper()
	if got[name] != want {
		t.Fatalf("%s = %s want %s", name, got[name], want)
	}
}
