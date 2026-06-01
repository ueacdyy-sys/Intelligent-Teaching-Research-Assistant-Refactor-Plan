package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
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
	phase := buildPhaseReport("principalLookup", []time.Duration{10 * time.Millisecond, 10 * time.Millisecond}, 0, 200*time.Millisecond)

	if phase.Name != "principalLookup" || phase.Operations != 2 || phase.Errors != 0 || phase.RPS != 10 {
		t.Fatalf("phase = %#v", phase)
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
	phase := buildPhaseReport("passwordLogin", []time.Duration{10 * time.Millisecond}, 0, 10*time.Millisecond)

	if phase.StepLatencyAttribution != nil {
		t.Fatalf("unexpected attribution = %#v", phase.StepLatencyAttribution)
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
					"sessionOperations": map[string]any{
						"saveSession": map[string]any{
							"count":          float64(2),
							"totalElapsedMs": float64(20),
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
					"sessionOperations": map[string]any{
						"saveSession": map[string]any{
							"count":          float64(5),
							"totalElapsedMs": float64(41),
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
	save := phaseDiagnostics.Delta.SessionOperations["saveSession"]
	if save.Count != 3 || save.TotalElapsedMS != 21 || save.AverageElapsedMS != 7 {
		t.Fatalf("saveSession delta = %#v", save)
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
