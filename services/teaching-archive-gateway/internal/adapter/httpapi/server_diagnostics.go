package httpapi

import (
	"crypto/subtle"
	"net/http"
)

func (s *Server) dbPoolDiagnostics(w http.ResponseWriter, r *http.Request) {
	if s.dbPoolStatsProvider == nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "diagnostics unavailable")
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if !constantTimeEquals(r.Header.Get("X-Internal-Diagnostics-Secret"), s.diagnosticsSecret) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid diagnostics secret")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"service": "teaching-archive-gateway",
		"stats":   s.dbPoolStatsProvider.TeachingArchiveDBPoolStats(),
	})
}

func constantTimeEquals(left string, right string) bool {
	if left == "" || right == "" || len(left) != len(right) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}
