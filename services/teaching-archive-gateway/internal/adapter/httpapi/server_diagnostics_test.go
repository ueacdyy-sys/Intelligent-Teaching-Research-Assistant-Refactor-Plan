package httpapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
)

func TestTeachingDBPoolDiagnosticsDisabledWithoutProvider(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(http.MethodGet, "/internal/teaching/db-pool", nil)
	request.Header.Set("X-Internal-Diagnostics-Secret", "ueacd")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestTeachingDBPoolDiagnosticsRequiresSecret(t *testing.T) {
	handler := newTeachingDiagnosticsTestHandler(fakeTeachingPoolStatsProvider{})
	request := httptest.NewRequest(http.MethodGet, "/internal/teaching/db-pool", nil)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("missing secret status = %d, body = %s", response.Code, response.Body.String())
	}

	wrongSecret := httptest.NewRequest(http.MethodGet, "/internal/teaching/db-pool", nil)
	wrongSecret.Header.Set("X-Internal-Diagnostics-Secret", "wrong")
	wrongResponse := httptest.NewRecorder()
	handler.ServeHTTP(wrongResponse, wrongSecret)

	if wrongResponse.Code != http.StatusUnauthorized {
		t.Fatalf("wrong secret status = %d, body = %s", wrongResponse.Code, wrongResponse.Body.String())
	}
}

func TestTeachingDBPoolDiagnosticsReturnsPoolStats(t *testing.T) {
	handler := newTeachingDiagnosticsTestHandler(fakeTeachingPoolStatsProvider{})
	request := httptest.NewRequest(http.MethodGet, "/internal/teaching/db-pool", nil)
	request.Header.Set("X-Internal-Diagnostics-Secret", "ueacd")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	var body struct {
		Status  string `json:"status"`
		Service string `json:"service"`
		Stats   struct {
			MaxConns               int32   `json:"maxConns"`
			TotalConns             int32   `json:"totalConns"`
			AcquiredConns          int32   `json:"acquiredConns"`
			AcquireDurationMs      float64 `json:"acquireDurationMs"`
			EmptyAcquireWaitTimeMs float64 `json:"emptyAcquireWaitTimeMs"`
		} `json:"stats"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON: %v", err)
	}
	if body.Status != "ok" || body.Service != "teaching-archive-gateway" {
		t.Fatalf("diagnostics identity = %#v", body)
	}
	if body.Stats.MaxConns != 12 || body.Stats.TotalConns != 10 || body.Stats.AcquiredConns != 8 {
		t.Fatalf("pool stats = %#v", body.Stats)
	}
	if body.Stats.AcquireDurationMs != 45.5 || body.Stats.EmptyAcquireWaitTimeMs != 12.25 {
		t.Fatalf("pool durations = %#v", body.Stats)
	}
	if strings.Contains(response.Body.String(), "ueacd") {
		t.Fatalf("diagnostics leaked secret: %s", response.Body.String())
	}
}

func newTeachingDiagnosticsTestHandler(provider platform.TeachingArchiveDBPoolStatsProvider) http.Handler {
	return httpapi.NewServer(httpapi.ServerConfig{
		AgentAPIKey:         "ueacd",
		DiagnosticsSecret:   "ueacd",
		DBPoolStatsProvider: provider,
	}).Handler()
}

type fakeTeachingPoolStatsProvider struct{}

func (fakeTeachingPoolStatsProvider) TeachingArchiveDBPoolStats() platform.TeachingArchiveDBPoolStats {
	return platform.TeachingArchiveDBPoolStats{
		MaxConns:               12,
		TotalConns:             10,
		AcquiredConns:          8,
		IdleConns:              2,
		ConstructingConns:      0,
		AcquireCount:           99,
		AcquireDurationMs:      45.5,
		CanceledAcquireCount:   0,
		EmptyAcquireCount:      3,
		EmptyAcquireWaitTimeMs: 12.25,
		NewConnsCount:          10,
	}
}
