package main

import (
	"testing"
	"time"
)

func TestValidateConfigRejectsInvalidLimit(t *testing.T) {
	err := validateConfig(maintenanceConfig{
		DatabaseURL:    "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
		Limit:          0,
		InactiveBefore: time.Hour,
		VacuumMode:     "none",
	})

	if err == nil {
		t.Fatal("validateConfig accepted a zero prune limit")
	}
}

func TestBuildMaintenanceReportIncludesPruneEvidence(t *testing.T) {
	now := time.Date(2026, 5, 31, 14, 0, 0, 0, time.UTC)
	cutoff := now.Add(-time.Hour)
	report := buildMaintenanceReport(
		maintenanceConfig{
			DatabaseURL:    "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
			Limit:          1000,
			InactiveBefore: time.Hour,
			VacuumMode:     "analyze",
		},
		now,
		cutoff,
		sessionTableStats{TotalRows: 451158, ActiveRows: 0, RevokedRows: 451158, TotalSizeBytes: 565182464},
		sessionTableStats{TotalRows: 0, ActiveRows: 0, RevokedRows: 0, TotalSizeBytes: 565182464},
		451158,
	)

	if report.Status != "PRUNED" || report.PrunedRows != 451158 {
		t.Fatalf("report = %#v", report)
	}
	if report.DatabaseURL != "postgres://app_user:***@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable" {
		t.Fatalf("database URL was not masked: %s", report.DatabaseURL)
	}
	if report.Cutoff != cutoff.Format(time.RFC3339Nano) {
		t.Fatalf("cutoff = %s want %s", report.Cutoff, cutoff.Format(time.RFC3339Nano))
	}
	if report.Before.TotalSize != "539 MB" {
		t.Fatalf("pretty size = %s", report.Before.TotalSize)
	}
	if report.VacuumMode != "analyze" {
		t.Fatalf("vacuum mode = %s", report.VacuumMode)
	}
}

func TestBuildMaintenanceReportMasksKeywordDatabaseURL(t *testing.T) {
	now := time.Date(2026, 5, 31, 14, 0, 0, 0, time.UTC)
	report := buildMaintenanceReport(
		maintenanceConfig{
			DatabaseURL: "host=127.0.0.1 user=app_user password=ueacd dbname=intelligent_teaching_assistant",
			Limit:       1000,
			VacuumMode:  "none",
		},
		now,
		now,
		sessionTableStats{},
		sessionTableStats{},
		0,
	)

	if report.DatabaseURL != "host=127.0.0.1 user=app_user password=*** dbname=intelligent_teaching_assistant" {
		t.Fatalf("keyword database URL was not masked: %s", report.DatabaseURL)
	}
}
