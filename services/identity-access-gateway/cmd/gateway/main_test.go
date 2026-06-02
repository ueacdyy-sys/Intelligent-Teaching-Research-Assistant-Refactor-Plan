package main

import (
	"testing"

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
