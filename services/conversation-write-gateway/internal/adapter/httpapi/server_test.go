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
	"ita-refactor/services/conversation-write-gateway/internal/usecase"
)

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

type fakeRepository struct {
	created domain.Conversation
}

func (f *fakeRepository) Create(_ context.Context, conversation domain.Conversation) error {
	f.created = conversation
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
