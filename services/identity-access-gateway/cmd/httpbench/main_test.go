package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
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

func TestMaskURL(t *testing.T) {
	got := maskURL("http://app_user:ueacd@127.0.0.1:18100")
	want := "http://app_user:***@127.0.0.1:18100"

	if got != want {
		t.Fatalf("maskURL() = %q want %q", got, want)
	}
}

func TestBuildPhaseReport(t *testing.T) {
	phase := buildPhaseReport(
		"principalLookup",
		[]time.Duration{10 * time.Millisecond, 10 * time.Millisecond},
		nil,
		0,
		200*time.Millisecond,
	)

	if phase.Name != "principalLookup" || phase.Operations != 2 || phase.Errors != 0 || phase.RPS != 10 {
		t.Fatalf("phase = %#v", phase)
	}
}

func TestBuildPhaseReportAddsServerTimingAndClientServerGap(t *testing.T) {
	phase := buildPhaseReport(
		"passwordLogin",
		[]time.Duration{12 * time.Millisecond, 20 * time.Millisecond, 30 * time.Millisecond},
		[]map[string]time.Duration{
			{"app": 8 * time.Millisecond, "response.encode": time.Millisecond},
			{"app": 10 * time.Millisecond, "response.encode": 2 * time.Millisecond},
			{"app": 15 * time.Millisecond, "response.encode": 3 * time.Millisecond},
		},
		0,
		60*time.Millisecond,
	)

	if phase.ServerTimingMS == nil || phase.ServerTimingMS.P99MS != 15 {
		t.Fatalf("server app timing = %#v", phase.ServerTimingMS)
	}
	if phase.ServerTimingSamples != 3 {
		t.Fatalf("server timing samples = %d want 3", phase.ServerTimingSamples)
	}
	if phase.ServerTimingBreakdownMS["response.encode"].P99MS != 3 {
		t.Fatalf("response.encode timing = %#v", phase.ServerTimingBreakdownMS["response.encode"])
	}
	if phase.ServerTimingBreakdownSamples["app"] != 3 {
		t.Fatalf("app samples = %d want 3", phase.ServerTimingBreakdownSamples["app"])
	}
	if phase.ClientServerGapMS == nil || phase.ClientServerGapMS.P99MS != 15 {
		t.Fatalf("client/server gap = %#v", phase.ClientServerGapMS)
	}
	if phase.ClientServerGapSamples != 3 {
		t.Fatalf("client/server gap samples = %d want 3", phase.ClientServerGapSamples)
	}
}

func TestBuildPhaseReportWithStepLatencies(t *testing.T) {
	phase := buildPhaseReportWithStepLatencies(
		"revokeCycle",
		[]time.Duration{100 * time.Millisecond, 200 * time.Millisecond},
		0,
		300*time.Millisecond,
		map[string][]time.Duration{
			"login":                  {30 * time.Millisecond, 40 * time.Millisecond},
			"revoke":                 {20 * time.Millisecond, 30 * time.Millisecond},
			"revokedPrincipalLookup": {50 * time.Millisecond, 70 * time.Millisecond},
		},
	)

	if phase.Name != "revokeCycle" || phase.LatencyMS.P95MS != 200 {
		t.Fatalf("phase-level summary = %#v", phase)
	}
	if phase.StepLatencyMS["login"].P95MS != 40 {
		t.Fatalf("login step summary = %#v", phase.StepLatencyMS["login"])
	}
	if phase.StepLatencyMS["revoke"].P95MS != 30 {
		t.Fatalf("revoke step summary = %#v", phase.StepLatencyMS["revoke"])
	}
	if phase.StepLatencyMS["revokedPrincipalLookup"].P95MS != 70 {
		t.Fatalf("revoked lookup step summary = %#v", phase.StepLatencyMS["revokedPrincipalLookup"])
	}
}

func TestBuildPhaseReportWithStepLatenciesAddsAttribution(t *testing.T) {
	phase := buildPhaseReportWithStepLatencies(
		"revokeCycle",
		[]time.Duration{100 * time.Millisecond, 200 * time.Millisecond},
		0,
		300*time.Millisecond,
		map[string][]time.Duration{
			"login":                  {30 * time.Millisecond, 40 * time.Millisecond},
			"revoke":                 {20 * time.Millisecond, 30 * time.Millisecond},
			"revokedPrincipalLookup": {50 * time.Millisecond, 70 * time.Millisecond},
		},
	)

	if phase.StepLatencyAttribution == nil {
		t.Fatal("missing step latency attribution")
	}
	if phase.StepLatencyAttribution.SlowestStep != "revokedPrincipalLookup" {
		t.Fatalf("slowest step = %s", phase.StepLatencyAttribution.SlowestStep)
	}
	if phase.StepLatencyAttribution.SlowestStepP99MS != 70 {
		t.Fatalf("slowest step p99 = %v", phase.StepLatencyAttribution.SlowestStepP99MS)
	}
	if phase.StepLatencyAttribution.StepP99SumMS != 140 {
		t.Fatalf("step p99 sum = %v", phase.StepLatencyAttribution.StepP99SumMS)
	}
	if phase.StepLatencyAttribution.P99ResidualMS != 60 {
		t.Fatalf("p99 residual = %v", phase.StepLatencyAttribution.P99ResidualMS)
	}
	if phase.StepLatencyAttribution.StepAvgSumMS != 120 {
		t.Fatalf("step avg sum = %v", phase.StepLatencyAttribution.StepAvgSumMS)
	}
	if phase.StepLatencyAttribution.AvgResidualMS != 30 {
		t.Fatalf("avg residual = %v", phase.StepLatencyAttribution.AvgResidualMS)
	}
}

func TestBuildPhaseReportWithoutStepLatenciesOmitsAttribution(t *testing.T) {
	phase := buildPhaseReport("passwordLogin", []time.Duration{10 * time.Millisecond}, nil, 0, 10*time.Millisecond)

	if phase.StepLatencyAttribution != nil {
		t.Fatalf("unexpected attribution = %#v", phase.StepLatencyAttribution)
	}
}

func TestRunWarmsIdentityWorkflowBeforeMeasuredPhases(t *testing.T) {
	var warmupLoginCount atomic.Int64
	var warmupPrincipalCount atomic.Int64
	var warmupRefreshCount atomic.Int64
	var warmupRevokeCount atomic.Int64
	var measuredLoginCount atomic.Int64
	var sessionCounter atomic.Int64
	revokedTokens := map[string]bool{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/health":
			w.WriteHeader(http.StatusOK)
		case r.Method == http.MethodPost && r.URL.Path == "/v1/identity/sessions/password":
			var request struct {
				Identifier string `json:"identifier"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Fatalf("decode login request: %v", err)
			}
			sessionID := "session-" + strconv.FormatInt(sessionCounter.Add(1), 10)
			accessToken := "access-" + sessionID
			refreshToken := "refresh-" + sessionID
			if strings.HasPrefix(request.Identifier, "teacher-warmup-") {
				warmupLoginCount.Add(1)
			} else {
				measuredLoginCount.Add(1)
			}
			w.Header().Set("Server-Timing", "app;dur=1.000")
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"accessToken":  accessToken,
				"refreshToken": refreshToken,
				"principal": map[string]string{
					"sessionId": sessionID,
				},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/identity/principal":
			token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if token == "access-session-1" {
				warmupPrincipalCount.Add(1)
			}
			w.Header().Set("Server-Timing", "app;dur=2.000")
			if revokedTokens[token] {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"role": "TEACHER"})
		case r.Method == http.MethodPost && r.URL.Path == "/v1/identity/sessions/refresh":
			var request struct {
				RefreshToken string `json:"refreshToken"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Fatalf("decode refresh request: %v", err)
			}
			sessionID := strings.TrimPrefix(request.RefreshToken, "refresh-")
			if sessionID == "session-1" {
				warmupRefreshCount.Add(1)
			}
			w.Header().Set("Server-Timing", "app;dur=3.000")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"accessToken":  "access-refreshed-" + sessionID,
				"refreshToken": "refresh-refreshed-" + sessionID,
				"principal": map[string]string{
					"sessionId": sessionID,
				},
			})
		case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/v1/identity/sessions/"):
			token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			revokedTokens[token] = true
			if token == "access-refreshed-session-1" {
				warmupRevokeCount.Add(1)
			}
			w.Header().Set("Server-Timing", "app;dur=4.000")
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	outPath := filepath.Join(t.TempDir(), "identity-http-report.json")
	err := run(benchmarkConfig{
		BaseURL:            server.URL,
		OutPath:            outPath,
		Concurrency:        1,
		OperationsPerPhase: 1,
		Timeout:            5 * time.Second,
		WarmupOperations:   1,
	})
	if err != nil {
		t.Fatalf("run() error = %v", err)
	}
	if warmupLoginCount.Load() != 1 ||
		warmupPrincipalCount.Load() != 1 ||
		warmupRefreshCount.Load() != 1 ||
		warmupRevokeCount.Load() != 1 {
		t.Fatalf(
			"warmup counts login=%d principal=%d refresh=%d revoke=%d",
			warmupLoginCount.Load(),
			warmupPrincipalCount.Load(),
			warmupRefreshCount.Load(),
			warmupRevokeCount.Load(),
		)
	}
	if measuredLoginCount.Load() <= warmupLoginCount.Load() {
		t.Fatalf("expected measured phases to run after warmup, login count=%d", measuredLoginCount.Load())
	}
	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("read report: %v", err)
	}
	var report benchmarkReport
	if err := json.Unmarshal(data, &report); err != nil {
		t.Fatalf("decode report: %v", err)
	}
	if report.WarmupOperations != 1 {
		t.Fatalf("WarmupOperations = %d want 1", report.WarmupOperations)
	}
	if report.Phases["passwordLogin"].Operations != 1 {
		t.Fatalf("passwordLogin measured operations = %d want 1", report.Phases["passwordLogin"].Operations)
	}
}

func TestRunRevokeCyclePhaseSeedsSessionsOutsideMeasuredSteps(t *testing.T) {
	var loginCount atomic.Int64
	var revokeCount atomic.Int64
	var principalCount atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/identity/sessions/password":
			index := loginCount.Add(1)
			w.Header().Set("Server-Timing", "app;dur=1.000")
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"accessToken":  "access-token",
				"refreshToken": "refresh-token",
				"principal": map[string]string{
					"sessionId": "session-" + strconv.FormatInt(index, 10),
				},
			})
		case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/v1/identity/sessions/"):
			revokeCount.Add(1)
			w.Header().Set("Server-Timing", "app;dur=2.000")
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && r.URL.Path == "/v1/identity/principal":
			principalCount.Add(1)
			w.Header().Set("Server-Timing", "app;dur=3.000")
			w.WriteHeader(http.StatusUnauthorized)
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	phase, err := runRevokeCyclePhase(
		context.Background(),
		server.Client(),
		[]string{server.URL},
		benchmarkConfig{Concurrency: 2, OperationsPerPhase: 4},
		nil,
	)
	if err != nil {
		t.Fatalf("runRevokeCyclePhase() error = %v", err)
	}

	if loginCount.Load() != 4 || revokeCount.Load() != 4 || principalCount.Load() != 4 {
		t.Fatalf("counts login=%d revoke=%d principal=%d", loginCount.Load(), revokeCount.Load(), principalCount.Load())
	}
	if _, ok := phase.StepLatencyMS["login"]; ok {
		t.Fatalf("login setup should not be a measured revokeCycle step: %#v", phase.StepLatencyMS)
	}
	if _, ok := phase.StepLatencyMS["revoke"]; !ok {
		t.Fatalf("missing revoke step latency: %#v", phase.StepLatencyMS)
	}
	if _, ok := phase.StepLatencyMS["revokedPrincipalLookup"]; !ok {
		t.Fatalf("missing revoked lookup step latency: %#v", phase.StepLatencyMS)
	}
	if phase.ServerTimingMS == nil || phase.ServerTimingMS.P99MS != 5 {
		t.Fatalf("server timing should include revoke+lookup only, got %#v", phase.ServerTimingMS)
	}
}

func TestParseServerTimingDurations(t *testing.T) {
	timings := parseServerTimingDurations("handler;dur=7.500, pre.usecase;dur=0.250, app;dur=6.125")

	if got := timings["handler"]; got != 7500*time.Microsecond {
		t.Fatalf("handler timing = %v", got)
	}
	if got := timings["pre.usecase"]; got != 250*time.Microsecond {
		t.Fatalf("pre.usecase timing = %v", got)
	}
	if got := timings["app"]; got != 6125*time.Microsecond {
		t.Fatalf("app timing = %v", got)
	}
}

func TestParseServerTimingDurationsSkipsInvalidMetrics(t *testing.T) {
	timings := parseServerTimingDurations("app;dur=bad, noDuration, response.encode;dur=1.250")

	if _, ok := timings["app"]; ok {
		t.Fatalf("invalid app timing should be skipped: %#v", timings)
	}
	if got := timings["response.encode"]; got != 1250*time.Microsecond {
		t.Fatalf("response.encode timing = %v", got)
	}
}

func TestBuildRevokeCycleStepOperationAttribution(t *testing.T) {
	phaseDiagnostics := gatewayDatabasePhaseDiagnostics{
		Delta: gatewayDatabaseDiagnosticsDelta{
			SessionOperations: map[string]gatewayDatabaseSessionOperationDelta{
				"saveSession": {
					Count:                2,
					TotalElapsedMS:       20,
					AverageElapsedMS:     10,
					RowsAffectedCount:    2,
					RowsAffected:         2,
					AverageRowsAffected:  1,
					DBExecuteElapsedMS:   8,
					PoolAcquireCount:     2,
					PoolAcquireElapsedMS: 6,
				},
				"revokeOwnSession": {
					Count:               2,
					TotalElapsedMS:      30,
					AverageElapsedMS:    15,
					RowsAffectedCount:   2,
					RowsAffected:        2,
					AverageRowsAffected: 1,
				},
			},
			WriteLimiter: &gatewayDatabaseWriteLimiterDelta{
				Operations: map[string]gatewayDatabaseWriteLimiterOperationDelta{
					"saveSession": {
						AcquireCount:             2,
						AcquireWaitTimeMS:        12,
						AverageAcquireWaitTimeMS: 6,
					},
					"revokeOwnSession": {
						AcquireCount:             2,
						AcquireWaitTimeMS:        18,
						AverageAcquireWaitTimeMS: 9,
					},
				},
			},
		},
	}
	stepLatencies := map[string]latencySummary{
		"login":                  {P99MS: 40, AvgMS: 20},
		"revoke":                 {P99MS: 55, AvgMS: 25},
		"revokedPrincipalLookup": {P99MS: 8, AvgMS: 4},
	}

	attribution := buildRevokeCycleStepOperationAttribution(stepLatencies, phaseDiagnostics)

	login := attribution["login"]
	if login.StepLatencyMS == nil || login.StepLatencyMS.P99MS != 40 {
		t.Fatalf("login step latency = %#v", login.StepLatencyMS)
	}
	if got := login.SessionOperations["saveSession"].AverageRowsAffected; got != 1 {
		t.Fatalf("login saveSession average rows affected = %v want 1", got)
	}
	if got := login.WriteLimiterOperations["saveSession"].AcquireWaitTimeMS; got != 12 {
		t.Fatalf("login saveSession write limiter wait = %v want 12", got)
	}
	revoke := attribution["revoke"]
	if got := revoke.SessionOperations["revokeOwnSession"].AverageRowsAffected; got != 1 {
		t.Fatalf("revoke revokeOwnSession average rows affected = %v want 1", got)
	}
	if got := revoke.WriteLimiterOperations["revokeOwnSession"].AcquireWaitTimeMS; got != 18 {
		t.Fatalf("revoke revokeOwnSession write limiter wait = %v want 18", got)
	}
	lookup := attribution["revokedPrincipalLookup"]
	if len(lookup.SessionOperations) != 0 {
		t.Fatalf("revoked lookup should not invent DB operations: %#v", lookup.SessionOperations)
	}
	if len(lookup.MissingSessionOperations) != 1 || lookup.MissingSessionOperations[0] != "getPrincipalByAccessToken" {
		t.Fatalf("revoked lookup missing operations = %#v", lookup.MissingSessionOperations)
	}
}

func TestBuildRevokeCycleStepOperationAttributionOmitsEmptyDiagnostics(t *testing.T) {
	attribution := buildRevokeCycleStepOperationAttribution(
		map[string]latencySummary{
			"login":                  {P99MS: 40, AvgMS: 20},
			"revoke":                 {P99MS: 55, AvgMS: 25},
			"revokedPrincipalLookup": {P99MS: 8, AvgMS: 4},
		},
		gatewayDatabasePhaseDiagnostics{},
	)

	if attribution != nil {
		t.Fatalf("empty diagnostics attribution = %#v want nil", attribution)
	}
}

func TestParseBaseURLs(t *testing.T) {
	got, err := parseBaseURLs("http://127.0.0.1:18100, http://127.0.0.1:18101/")
	if err != nil {
		t.Fatalf("parseBaseURLs() error = %v", err)
	}
	want := []string{"http://127.0.0.1:18100", "http://127.0.0.1:18101"}

	if len(got) != len(want) {
		t.Fatalf("base URLs = %#v want %#v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("base URL %d = %q want %q", index, got[index], want[index])
		}
	}
}

func TestBaseURLForOperationRoundRobin(t *testing.T) {
	baseURLs := []string{"http://127.0.0.1:18100", "http://127.0.0.1:18101"}

	if got := baseURLForOperation(baseURLs, 0); got != baseURLs[0] {
		t.Fatalf("op 0 base URL = %q", got)
	}
	if got := baseURLForOperation(baseURLs, 1); got != baseURLs[1] {
		t.Fatalf("op 1 base URL = %q", got)
	}
	if got := baseURLForOperation(baseURLs, 2); got != baseURLs[0] {
		t.Fatalf("op 2 base URL = %q", got)
	}
}

func TestBuildHTTPClientReportsTransportProfile(t *testing.T) {
	config := benchmarkConfig{
		Concurrency:            1200,
		MaxConnsPerHost:        300,
		WarmConnectionsPerHost: 300,
	}

	_, profile := buildHTTPClient(config, 4)

	if profile.MaxConnsPerHost != 300 {
		t.Fatalf("MaxConnsPerHost = %d want 300", profile.MaxConnsPerHost)
	}
	if profile.WarmConnectionsPerHost != 300 {
		t.Fatalf("WarmConnectionsPerHost = %d want 300", profile.WarmConnectionsPerHost)
	}
	if profile.WarmConnectionsTotal != 1200 {
		t.Fatalf("WarmConnectionsTotal = %d want 1200", profile.WarmConnectionsTotal)
	}
	if profile.MaxIdleConns < 1200 || profile.MaxIdleConnsPerHost < 1200 {
		t.Fatalf("idle connection profile is too small: %#v", profile)
	}
}

func TestBuildGatewayDatabasePhaseDiagnosticsDelta(t *testing.T) {
	before := gatewayDatabaseDiagnosticsSnapshot{
		Gateways: []gatewayDatabaseDiagnosticsGateway{
			{
				Status: "OK",
				Stats: map[string]any{
					"acquireCount":           float64(10),
					"acquireDurationMs":      float64(100),
					"emptyAcquireWaitTimeMs": float64(80),
					"writeLimiter": map[string]any{
						"enabled":                   true,
						"limit":                     float64(2),
						"acquireCount":              float64(10),
						"acquireWaitTimeMs":         float64(100),
						"canceledAcquireCount":      float64(1),
						"canceledAcquireWaitTimeMs": float64(8),
						"operations": map[string]any{
							"saveSession": map[string]any{
								"acquireCount":              float64(2),
								"acquireWaitTimeMs":         float64(6),
								"canceledAcquireCount":      float64(1),
								"canceledAcquireWaitTimeMs": float64(8),
							},
						},
					},
					"sessionOperations": map[string]any{
						"saveSession": map[string]any{
							"count":                       float64(2),
							"totalElapsedMs":              float64(20),
							"rowsAffectedCount":           float64(2),
							"rowsAffected":                float64(2),
							"averageRowsAffected":         float64(1),
							"poolAcquireCount":            float64(2),
							"poolAcquireElapsedMs":        float64(6),
							"averagePoolAcquireElapsedMs": float64(3),
							"dbExecuteElapsedMs":          float64(8),
							"averageDbExecuteElapsedMs":   float64(4),
						},
					},
				},
			},
		},
	}
	after := gatewayDatabaseDiagnosticsSnapshot{
		Gateways: []gatewayDatabaseDiagnosticsGateway{
			{
				Status: "OK",
				Stats: map[string]any{
					"acquireCount":           float64(17),
					"acquireDurationMs":      float64(163),
					"emptyAcquireWaitTimeMs": float64(139),
					"writeLimiter": map[string]any{
						"enabled":                   true,
						"limit":                     float64(2),
						"acquireCount":              float64(17),
						"acquireWaitTimeMs":         float64(163),
						"canceledAcquireCount":      float64(1),
						"canceledAcquireWaitTimeMs": float64(8),
						"operations": map[string]any{
							"saveSession": map[string]any{
								"acquireCount":              float64(5),
								"acquireWaitTimeMs":         float64(21),
								"canceledAcquireCount":      float64(1),
								"canceledAcquireWaitTimeMs": float64(8),
							},
						},
					},
					"sessionOperations": map[string]any{
						"saveSession": map[string]any{
							"count":                       float64(5),
							"totalElapsedMs":              float64(41),
							"rowsAffectedCount":           float64(5),
							"rowsAffected":                float64(5),
							"averageRowsAffected":         float64(1),
							"poolAcquireCount":            float64(5),
							"poolAcquireElapsedMs":        float64(21),
							"averagePoolAcquireElapsedMs": float64(4.2),
							"dbExecuteElapsedMs":          float64(20),
							"averageDbExecuteElapsedMs":   float64(4),
						},
						"getPrincipalByAccessToken": map[string]any{
							"count":          float64(4),
							"totalElapsedMs": float64(16),
						},
					},
				},
			},
		},
	}

	phaseDiagnostics := buildGatewayDatabasePhaseDiagnostics(before, after)

	if phaseDiagnostics.Delta.Pool.AcquireCount != 7 {
		t.Fatalf("pool acquire delta = %#v want 7", phaseDiagnostics.Delta.Pool)
	}
	if phaseDiagnostics.Delta.Pool.AcquireDurationMS != 63 {
		t.Fatalf("pool acquire duration delta = %#v want 63", phaseDiagnostics.Delta.Pool)
	}
	if phaseDiagnostics.Delta.Pool.EmptyAcquireWaitTimeMS != 59 {
		t.Fatalf("pool empty acquire wait delta = %#v want 59", phaseDiagnostics.Delta.Pool)
	}
	if phaseDiagnostics.Delta.WriteLimiter == nil {
		t.Fatal("missing write limiter phase delta")
	}
	if phaseDiagnostics.Delta.WriteLimiter.EnabledGateways != 1 || phaseDiagnostics.Delta.WriteLimiter.ConfiguredLimitTotal != 2 {
		t.Fatalf("write limiter shape delta = %#v", phaseDiagnostics.Delta.WriteLimiter)
	}
	if phaseDiagnostics.Delta.WriteLimiter.AcquireCount != 7 ||
		phaseDiagnostics.Delta.WriteLimiter.AcquireWaitTimeMS != 63 ||
		phaseDiagnostics.Delta.WriteLimiter.AverageAcquireWaitTimeMS != 9 {
		t.Fatalf("write limiter acquire delta = %#v", phaseDiagnostics.Delta.WriteLimiter)
	}
	saveLimiter := phaseDiagnostics.Delta.WriteLimiter.Operations["saveSession"]
	if saveLimiter.AcquireCount != 3 ||
		saveLimiter.AcquireWaitTimeMS != 15 ||
		saveLimiter.AverageAcquireWaitTimeMS != 5 {
		t.Fatalf("saveSession write limiter delta = %#v", saveLimiter)
	}
	save := phaseDiagnostics.Delta.SessionOperations["saveSession"]
	if save.Count != 3 || save.TotalElapsedMS != 21 || save.AverageElapsedMS != 7 {
		t.Fatalf("saveSession delta = %#v", save)
	}
	if save.PoolAcquireCount != 3 || save.PoolAcquireElapsedMS != 15 || save.AveragePoolAcquireElapsedMS != 5 {
		t.Fatalf("saveSession pool acquire delta = %#v", save)
	}
	if save.DBExecuteElapsedMS != 12 || save.AverageDBExecuteElapsedMS != 4 {
		t.Fatalf("saveSession db execute delta = %#v", save)
	}
	if save.RowsAffectedCount != 3 || save.RowsAffected != 3 || save.AverageRowsAffected != 1 {
		t.Fatalf("saveSession rows affected delta = %#v", save)
	}
	lookup := phaseDiagnostics.Delta.SessionOperations["getPrincipalByAccessToken"]
	if lookup.Count != 4 || lookup.TotalElapsedMS != 16 || lookup.AverageElapsedMS != 4 {
		t.Fatalf("lookup delta = %#v", lookup)
	}
}

func TestCollectGatewayDatabaseDiagnosticsMasksSecret(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get(internalDiagnosticsSecretHeader) != "ueacd" {
			http.Error(w, "missing secret", http.StatusUnauthorized)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status": "ok",
			"stats": map[string]any{
				"maxConns": 12,
				"debug":    "ueacd",
			},
		})
	}))
	defer server.Close()

	snapshot := collectGatewayDatabaseDiagnostics(
		context.Background(),
		server.Client(),
		[]string{server.URL},
		"ueacd",
		func() time.Time { return time.Date(2026, 6, 1, 15, 0, 0, 0, time.UTC) },
	)
	data, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatalf("marshal snapshot: %v", err)
	}
	if strings.Contains(string(data), "ueacd") {
		t.Fatalf("diagnostics leaked secret: %s", data)
	}
	if snapshot.Gateways[0].Stats["debug"] != "***" {
		t.Fatalf("masked debug stat = %#v", snapshot.Gateways[0].Stats["debug"])
	}
}
