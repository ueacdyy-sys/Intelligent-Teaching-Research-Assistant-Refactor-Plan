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

func TestLatencySummaryEmpty(t *testing.T) {
	summary := summarizeLatencies(nil)

	if summary.MinMS != 0 || summary.P50MS != 0 || summary.P95MS != 0 || summary.P99MS != 0 || summary.MaxMS != 0 || summary.AvgMS != 0 {
		t.Fatalf("summary = %#v", summary)
	}
}

func TestMaskDatabaseURL(t *testing.T) {
	got := maskDatabaseURL("postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable")
	want := "postgres://app_user:***@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable"

	if got != want {
		t.Fatalf("maskDatabaseURL() = %q want %q", got, want)
	}
}

func TestPhaseRPS(t *testing.T) {
	phase := buildPhaseReport("lookup", []time.Duration{10 * time.Millisecond, 10 * time.Millisecond}, 0, 200*time.Millisecond)

	if phase.Name != "lookup" || phase.Operations != 2 || phase.Errors != 0 || phase.RPS != 10 {
		t.Fatalf("phase = %#v", phase)
	}
}
