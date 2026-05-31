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
