package main

import (
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
