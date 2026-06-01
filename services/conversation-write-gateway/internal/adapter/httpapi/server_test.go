package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/conversation-write-gateway/internal/adapter/httpapi"
	"ita-refactor/services/conversation-write-gateway/internal/domain"
	"ita-refactor/services/conversation-write-gateway/internal/platform"
	"ita-refactor/services/conversation-write-gateway/internal/usecase"
)

func TestConversationDBPoolDiagnosticsDisabledWithoutProvider(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(http.MethodGet, "/internal/conversation/db-pool", nil)
	request.Header.Set("X-Internal-Diagnostics-Secret", "ueacd")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestConversationDBPoolDiagnosticsRequiresSecret(t *testing.T) {
	handler := newDiagnosticsTestHandler(fakePoolStatsProvider{})
	request := httptest.NewRequest(http.MethodGet, "/internal/conversation/db-pool", nil)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("missing secret status = %d, body = %s", response.Code, response.Body.String())
	}

	wrongSecret := httptest.NewRequest(http.MethodGet, "/internal/conversation/db-pool", nil)
	wrongSecret.Header.Set("X-Internal-Diagnostics-Secret", "wrong")
	wrongResponse := httptest.NewRecorder()
	handler.ServeHTTP(wrongResponse, wrongSecret)

	if wrongResponse.Code != http.StatusUnauthorized {
		t.Fatalf("wrong secret status = %d, body = %s", wrongResponse.Code, wrongResponse.Body.String())
	}
}

func TestConversationDBPoolDiagnosticsReturnsPoolStats(t *testing.T) {
	handler := newDiagnosticsTestHandler(fakePoolStatsProvider{})
	request := httptest.NewRequest(http.MethodGet, "/internal/conversation/db-pool", nil)
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
	if body.Status != "ok" || body.Service != "conversation-write-gateway" {
		t.Fatalf("diagnostics identity = %#v", body)
	}
	if body.Stats.MaxConns != 10 || body.Stats.TotalConns != 8 || body.Stats.AcquiredConns != 7 {
		t.Fatalf("pool stats = %#v", body.Stats)
	}
	if body.Stats.AcquireDurationMs != 123.5 || body.Stats.EmptyAcquireWaitTimeMs != 99.25 {
		t.Fatalf("pool durations = %#v", body.Stats)
	}
	if strings.Contains(response.Body.String(), "ueacd") {
		t.Fatalf("diagnostics leaked secret: %s", response.Body.String())
	}
}

func TestCreateConversationReturnsCreatedResponse(t *testing.T) {
	handler, repo := newTestHandlerWithRepository()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/research/conversations",
		bytes.NewBufferString(`{"title":"  Research  ","settings":{"fusionMode":"balanced"}}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if timing := response.Header().Get("Server-Timing"); !strings.HasPrefix(timing, "app;dur=") {
		t.Fatalf("Server-Timing = %q, want app duration", timing)
	} else if !strings.Contains(timing, "db.acquire;dur=") || !strings.Contains(timing, "db.insert;dur=") {
		t.Fatalf("Server-Timing = %q, want DB timing breakdown", timing)
	}

	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON: %v", err)
	}
	if body["id"] != "conv_http" {
		t.Fatalf("id = %v", body["id"])
	}
	if body["title"] != "Research" {
		t.Fatalf("title = %v", body["title"])
	}
	if body["messageCount"].(float64) != 0 {
		t.Fatalf("messageCount = %v", body["messageCount"])
	}
	settings, ok := body["settings"].(map[string]any)
	if !ok {
		t.Fatalf("settings = %#v, want object", body["settings"])
	}
	if settings["fusionMode"] != "balanced" {
		t.Fatalf("settings.fusionMode = %v", settings["fusionMode"])
	}
	if string(repo.created.Settings.JSON()) != `{"fusionMode":"balanced"}` {
		t.Fatalf("persisted settings = %s", repo.created.Settings.JSON())
	}
}

func TestCreateConversationRequiresAgentAPIKey(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/research/conversations",
		bytes.NewBufferString(`{"title":"Research"}`),
	)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestCreateConversationReturnsValidationError(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/research/conversations",
		bytes.NewBufferString(`{"title":"   "}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte("VALIDATION_ERROR")) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestCreateConversationRejectsNonObjectSettings(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/research/conversations",
		bytes.NewBufferString(`{"title":"Research","settings":["fast"]}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte("settings must be an object or null")) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func newTestHandler() http.Handler {
	handler, _ := newTestHandlerWithRepository()
	return handler
}

func newTestHandlerWithRepository() (http.Handler, *fakeRepository) {
	repo := &fakeRepository{}
	uc := usecase.NewCreateConversation(
		repo,
		nil,
		fixedIDs{id: "conv_http"},
		fixedClock{now: time.Date(2026, 5, 28, 8, 0, 0, 0, time.UTC)},
	)
	return httpapi.NewServer(uc, "ueacd").Handler(), repo
}

func newDiagnosticsTestHandler(provider platform.ConversationDBPoolStatsProvider) http.Handler {
	repo := &fakeRepository{}
	uc := usecase.NewCreateConversation(
		repo,
		nil,
		fixedIDs{id: "conv_http"},
		fixedClock{now: time.Date(2026, 5, 28, 8, 0, 0, 0, time.UTC)},
	)
	return httpapi.NewServerWithConfig(httpapi.ServerConfig{
		CreateConversation:  uc,
		AgentAPIKey:         "ueacd",
		DiagnosticsSecret:   "ueacd",
		DBPoolStatsProvider: provider,
	}).Handler()
}

type fakeRepository struct {
	created domain.Conversation
}

func (f *fakeRepository) Create(ctx context.Context, conversation domain.Conversation) error {
	f.created = conversation
	if timing := platform.ConversationTimingFromContext(ctx); timing != nil {
		timing.DBAcquire = time.Millisecond
		timing.DBInsert = 2 * time.Millisecond
	}
	return nil
}

type fixedIDs struct {
	id string
}

func (f fixedIDs) NewID() string {
	return f.id
}

type fixedClock struct {
	now time.Time
}

func (f fixedClock) Now() time.Time {
	return f.now
}

type fakePoolStatsProvider struct{}

func (fakePoolStatsProvider) ConversationDBPoolStats() platform.ConversationDBPoolStats {
	return platform.ConversationDBPoolStats{
		MaxConns:               10,
		TotalConns:             8,
		AcquiredConns:          7,
		IdleConns:              1,
		ConstructingConns:      0,
		AcquireCount:           42,
		AcquireDurationMs:      123.5,
		CanceledAcquireCount:   0,
		EmptyAcquireCount:      21,
		EmptyAcquireWaitTimeMs: 99.25,
		NewConnsCount:          8,
	}
}
