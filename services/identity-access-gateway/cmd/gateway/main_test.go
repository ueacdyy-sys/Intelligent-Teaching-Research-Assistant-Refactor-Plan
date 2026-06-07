package main

import (
	"testing"

	"github.com/jackc/pgx/v5"

	"ita-refactor/services/identity-access-gateway/internal/adapter/postgres"
)

func TestParseSessionTablePersistence(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  postgres.SessionTablePersistence
	}{
		{name: "default", value: "", want: postgres.SessionTablePersistenceLogged},
		{name: "logged", value: "logged", want: postgres.SessionTablePersistenceLogged},
		{name: "unlogged", value: "unlogged", want: postgres.SessionTablePersistenceUnlogged},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := parseSessionTablePersistence(test.value)
			if err != nil {
				t.Fatalf("parseSessionTablePersistence error = %v", err)
			}
			if got != test.want {
				t.Fatalf("parseSessionTablePersistence = %q want %q", got, test.want)
			}
		})
	}
}

func TestParseSessionTablePersistenceRejectsInvalidValues(t *testing.T) {
	if _, err := parseSessionTablePersistence("temporary"); err == nil {
		t.Fatal("parseSessionTablePersistence should reject invalid values")
	}
}

func TestParseSessionDBMinConns(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		maxConns int
		want     int
	}{
		{name: "default", value: "", maxConns: 8, want: 0},
		{name: "explicit warm pool", value: "4", maxConns: 8, want: 4},
		{name: "equal to max", value: "8", maxConns: 8, want: 8},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := parseSessionDBMinConns(test.value, test.maxConns)
			if err != nil {
				t.Fatalf("parseSessionDBMinConns error = %v", err)
			}
			if got != test.want {
				t.Fatalf("parseSessionDBMinConns = %d want %d", got, test.want)
			}
		})
	}
}

func TestParseSessionDBMinConnsRejectsInvalidValues(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		maxConns int
	}{
		{name: "non integer", value: "warm", maxConns: 8},
		{name: "negative", value: "-1", maxConns: 8},
		{name: "greater than max", value: "9", maxConns: 8},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := parseSessionDBMinConns(test.value, test.maxConns); err == nil {
				t.Fatalf("parseSessionDBMinConns should reject %q with max %d", test.value, test.maxConns)
			}
		})
	}
}

func TestParseSessionDBPrewarmConns(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		maxConns int
		want     int
	}{
		{name: "default warms one connection", value: "", maxConns: 8, want: 1},
		{name: "disabled", value: "0", maxConns: 8, want: 0},
		{name: "equal to max", value: "8", maxConns: 8, want: 8},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := parseSessionDBPrewarmConns(test.value, test.maxConns)
			if err != nil {
				t.Fatalf("parseSessionDBPrewarmConns error = %v", err)
			}
			if got != test.want {
				t.Fatalf("parseSessionDBPrewarmConns = %d want %d", got, test.want)
			}
		})
	}
}

func TestParseSessionDBPrewarmConnsRejectsInvalidValues(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		maxConns int
	}{
		{name: "non integer", value: "warm", maxConns: 8},
		{name: "negative", value: "-1", maxConns: 8},
		{name: "greater than max", value: "9", maxConns: 8},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := parseSessionDBPrewarmConns(test.value, test.maxConns); err == nil {
				t.Fatalf("parseSessionDBPrewarmConns should reject %q with max %d", test.value, test.maxConns)
			}
		})
	}
}

func TestParseSessionDBQueryExecMode(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		wantName string
		wantMode pgx.QueryExecMode
	}{
		{name: "default", value: "", wantName: "cache_statement", wantMode: pgx.QueryExecModeCacheStatement},
		{name: "cache statement", value: "cache_statement", wantName: "cache_statement", wantMode: pgx.QueryExecModeCacheStatement},
		{name: "cache describe", value: "cache_describe", wantName: "cache_describe", wantMode: pgx.QueryExecModeCacheDescribe},
		{name: "describe exec", value: "describe_exec", wantName: "describe_exec", wantMode: pgx.QueryExecModeDescribeExec},
		{name: "exec", value: " EXEC ", wantName: "exec", wantMode: pgx.QueryExecModeExec},
		{name: "simple protocol", value: "simple_protocol", wantName: "simple_protocol", wantMode: pgx.QueryExecModeSimpleProtocol},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			gotName, gotMode, err := parseSessionDBQueryExecMode(test.value)
			if err != nil {
				t.Fatalf("parseSessionDBQueryExecMode error = %v", err)
			}
			if gotName != test.wantName {
				t.Fatalf("parseSessionDBQueryExecMode name = %q want %q", gotName, test.wantName)
			}
			if gotMode != test.wantMode {
				t.Fatalf("parseSessionDBQueryExecMode mode = %v want %v", gotMode, test.wantMode)
			}
		})
	}
}

func TestParseSessionDBQueryExecModeRejectsInvalidValues(t *testing.T) {
	for _, value := range []string{"prepared", "cache-statement", "simple"} {
		t.Run(value, func(t *testing.T) {
			if _, _, err := parseSessionDBQueryExecMode(value); err == nil {
				t.Fatalf("parseSessionDBQueryExecMode should reject %q", value)
			}
		})
	}
}
