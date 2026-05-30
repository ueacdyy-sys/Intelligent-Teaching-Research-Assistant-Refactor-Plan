package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (s *Server) endAttendanceSessionMetadata(w http.ResponseWriter, r *http.Request, sessionID string) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.endAttendanceSession == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "attendance session end use case is not configured")
		return
	}

	session, err := s.endAttendanceSession.Execute(r.Context(), domain.EndAttendanceSessionInput{
		Principal: principal,
		SessionID: sessionID,
	})
	if handleArchiveError(w, err, "failed to end attendance session") {
		return
	}

	writeJSON(w, http.StatusOK, toAttendanceSessionResponse(session))
}
