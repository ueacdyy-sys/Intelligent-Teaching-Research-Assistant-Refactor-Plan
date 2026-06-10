package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (s *Server) listStudentAppAITutorRequestMetadata(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.listStudentAppAITutorRequests == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student app ai tutor request list use case is not configured")
		return
	}

	pageSize, ok := parseOptionalInt(w, r.URL.Query().Get("pageSize"), "pageSize")
	if !ok {
		return
	}
	page, err := s.listStudentAppAITutorRequests.Execute(r.Context(), domain.ListStudentAppAITutorRequestsInput{
		Principal: principal,
		Status:    domain.TutoringAnalysisStatus(r.URL.Query().Get("status")),
		PageSize:  pageSize,
		Cursor:    r.URL.Query().Get("cursor"),
	})
	if handleArchiveError(w, err, "failed to list student app ai tutor requests") {
		return
	}
	response, err := toStudentAppAITutorRequestProgressListResponse(page)
	if handleArchiveError(w, err, "failed to build student app ai tutor request progress") {
		return
	}
	writeJSON(w, http.StatusOK, response)
}
