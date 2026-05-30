package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type attendanceSignInRequest struct {
	Method          domain.AttendanceSignInMethod `json:"method"`
	TimestampMillis *int64                        `json:"timestampMillis,omitempty"`
	Code            string                        `json:"code,omitempty"`
	Gesture         []int                         `json:"gesture,omitempty"`
}

func (s *Server) signInAttendanceMetadata(w http.ResponseWriter, r *http.Request, sessionID string) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.signInAttendance == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "attendance sign-in use case is not configured")
		return
	}

	var request attendanceSignInRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	input := domain.AttendanceSignInInput{
		Principal: principal,
		SessionID: sessionID,
		Method:    request.Method,
		Code:      request.Code,
		Gesture:   request.Gesture,
	}
	if request.TimestampMillis != nil {
		input.TimestampMillis = *request.TimestampMillis
		input.HasTimestamp = true
	}

	result, err := s.signInAttendance.Execute(r.Context(), input)
	if handleArchiveError(w, err, "failed to sign in attendance") {
		return
	}

	status := http.StatusOK
	if result.Created {
		status = http.StatusCreated
	}
	writeJSON(w, status, toAttendanceRecordResponse(result.Record))
}
