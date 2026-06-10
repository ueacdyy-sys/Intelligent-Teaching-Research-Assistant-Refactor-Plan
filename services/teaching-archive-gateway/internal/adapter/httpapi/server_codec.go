package httpapi

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (s *Server) authorized(r *http.Request) bool {
	if s.agentAPIKey == "" {
		return true
	}
	return r.Header.Get("X-Agent-Api-Key") == s.agentAPIKey
}

func parsePrincipalContext(w http.ResponseWriter, r *http.Request) (domain.PrincipalContext, bool) {
	principal, err := decodePrincipalContextHeader(r.Header.Get("X-Principal-Context"))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid principal context")
		return domain.PrincipalContext{}, false
	}
	return principal, true
}

func decodePrincipalContextHeader(value string) (domain.PrincipalContext, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return domain.PrincipalContext{}, domain.ErrUnauthenticated
	}
	data, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		data, err = base64.URLEncoding.DecodeString(value)
	}
	if err != nil {
		return domain.PrincipalContext{}, domain.ErrUnauthenticated
	}
	var principal domain.PrincipalContext
	if err := json.Unmarshal(data, &principal); err != nil {
		return domain.PrincipalContext{}, domain.ErrUnauthenticated
	}
	if err := domain.ValidatePrincipalContext(principal); err != nil {
		return domain.PrincipalContext{}, err
	}
	return principal, nil
}

func handleArchiveError(w http.ResponseWriter, err error, internalMessage string) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, domain.ErrValidation):
		writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
	case errors.Is(err, domain.ErrUnauthenticated):
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid principal context")
	case errors.Is(err, domain.ErrForbidden):
		writeError(w, http.StatusForbidden, "FORBIDDEN", err.Error())
	case errors.Is(err, domain.ErrAttendanceSessionNotFound):
		writeError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
	case errors.Is(err, domain.ErrNotFound):
		writeError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
	case errors.Is(err, domain.ErrAttendanceSessionNotActive):
		writeError(w, http.StatusConflict, "CONFLICT", err.Error())
	case errors.Is(err, domain.ErrConflict):
		writeError(w, http.StatusConflict, "CONFLICT", err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", internalMessage)
	}
	return true
}

func parseOptionalInt(w http.ResponseWriter, value string, field string) (int, bool) {
	if value == "" {
		return 0, true
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", field+" must be an integer")
		return 0, false
	}
	return parsed, true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "invalid request body")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	body, err := encodeJSONPayload(payload)
	if err != nil {
		writeResponseEncodingError(w)
		return
	}
	writeJSONBytes(w, status, body)
}

func encodeJSONPayload(payload any) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return append(body, '\n'), nil
}

func writeJSONBytes(w http.ResponseWriter, status int, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

func writePrivateConditionalJSON(w http.ResponseWriter, r *http.Request, status int, payload any) {
	body, err := encodeJSONPayload(payload)
	if err != nil {
		writeResponseEncodingError(w)
		return
	}
	etag := responseETag(body)
	setPrivateConditionalHeaders(w, etag)
	if status == http.StatusOK && requestMatchesETag(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	writeJSONBytes(w, status, body)
}

func setPrivateConditionalHeaders(w http.ResponseWriter, etag string) {
	w.Header().Set("Cache-Control", "private, no-cache")
	w.Header().Set("ETag", etag)
	appendVaryHeader(w.Header(), "X-Principal-Context")
	appendVaryHeader(w.Header(), "X-Agent-Api-Key")
}

func responseETag(body []byte) string {
	sum := sha256.Sum256(body)
	return `"sha256-` + base64.RawURLEncoding.EncodeToString(sum[:]) + `"`
}

func requestMatchesETag(headerValue string, etag string) bool {
	for _, candidate := range strings.Split(headerValue, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "*" || candidate == etag || strings.TrimPrefix(candidate, "W/") == etag {
			return true
		}
	}
	return false
}

func appendVaryHeader(header http.Header, value string) {
	current := header.Get("Vary")
	if current == "" {
		header.Set("Vary", value)
		return
	}
	for _, part := range strings.Split(current, ",") {
		if strings.EqualFold(strings.TrimSpace(part), value) {
			return
		}
	}
	header.Set("Vary", current+", "+value)
}

func writeResponseEncodingError(w http.ResponseWriter) {
	body := []byte(`{"error":{"code":"INTERNAL_ERROR","message":"failed to encode response"}}` + "\n")
	writeJSONBytes(w, http.StatusInternalServerError, body)
}

func writeError(w http.ResponseWriter, status int, code string, message string) {
	writeJSON(w, status, errorResponse{Error: apiError{Code: code, Message: message}})
}
