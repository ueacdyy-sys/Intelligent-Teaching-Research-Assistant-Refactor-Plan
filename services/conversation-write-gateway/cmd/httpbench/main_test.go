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

func TestBuildPhaseReport(t *testing.T) {
	phase := buildPhaseReport(
		"createConversation",
		[]time.Duration{10 * time.Millisecond, 10 * time.Millisecond},
		0,
		200*time.Millisecond,
	)

	if phase.Name != "createConversation" || phase.Operations != 2 || phase.Errors != 0 || phase.RPS != 10 {
		t.Fatalf("phase = %#v", phase)
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
	}

	_, profile := buildHTTPClient(config, 4)

	if profile.MaxConnsPerHost != 200 {
		t.Fatalf("MaxConnsPerHost = %d want 200", profile.MaxConnsPerHost)
	}
	if profile.WarmConnectionsTotal != 800 {
		t.Fatalf("WarmConnectionsTotal = %d want 800", profile.WarmConnectionsTotal)
	}
	if profile.MaxIdleConns < 800 || profile.MaxIdleConnsPerHost < 800 {
		t.Fatalf("idle connection profile is too small: %#v", profile)
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
