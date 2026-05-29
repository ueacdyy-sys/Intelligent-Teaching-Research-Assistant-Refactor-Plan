package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"ita-refactor/services/conversation-write-gateway/internal/domain"
	"ita-refactor/services/conversation-write-gateway/internal/usecase"
)

type Server struct {
	createConversation *usecase.CreateConversation
	agentAPIKey        string
}

type createConversationRequest struct {
	Title    string          `json:"title"`
	Settings json.RawMessage `json:"settings,omitempty"`
}

type conversationResponse struct {
	ID           string         `json:"id"`
	Title        string         `json:"title"`
	CreatedAt    string         `json:"createdAt"`
	UpdatedAt    string         `json:"updatedAt"`
	MessageCount int            `json:"messageCount"`
	TotalTokens  int            `json:"totalTokens"`
	Settings     map[string]any `json:"settings,omitempty"`
}

type errorResponse struct {
	Error apiError `json:"error"`
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func NewServer(createConversation *usecase.CreateConversation, agentAPIKey string) *Server {
	return &Server{
		createConversation: createConversation,
		agentAPIKey:        agentAPIKey,
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.health)
	mux.HandleFunc("/v1/research/conversations", s.create)
	return mux
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "conversation-write-gateway"})
}

func (s *Server) create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}

	var request createConversationRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "invalid request body")
		return
	}

	settings, ok := decodeSettings(w, request.Settings)
	if !ok {
		return
	}

	conversation, err := s.createConversation.Execute(r.Context(), domain.CreateConversationInput{
		Title:    request.Title,
		Settings: settings,
	})
	if errors.Is(err, domain.ErrInvalidTitle) {
		writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create conversation")
		return
	}

	writeJSON(w, http.StatusCreated, toResponse(conversation))
}

func (s *Server) authorized(r *http.Request) bool {
	if s.agentAPIKey == "" {
		return true
	}
	return r.Header.Get("X-Agent-Api-Key") == s.agentAPIKey
}

func decodeSettings(w http.ResponseWriter, raw json.RawMessage) (domain.Settings, bool) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, true
	}
	var settings map[string]any
	if err := json.Unmarshal(raw, &settings); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "settings must be an object or null")
		return nil, false
	}
	return domain.Settings(settings), true
}

func toResponse(conversation domain.Conversation) conversationResponse {
	return conversationResponse{
		ID:           conversation.ID,
		Title:        conversation.Title,
		CreatedAt:    formatTime(conversation.CreatedAt),
		UpdatedAt:    formatTime(conversation.UpdatedAt),
		MessageCount: conversation.MessageCount,
		TotalTokens:  conversation.TotalTokens,
		Settings:     map[string]any(conversation.Settings),
	}
}

func formatTime(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, code string, message string) {
	writeJSON(w, status, errorResponse{Error: apiError{Code: code, Message: message}})
}
