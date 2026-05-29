package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (s *Server) aiGradingRequests(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.listAIGradingRequestMetadata(w, r)
}

func (s *Server) listAIGradingRequestMetadata(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}

	pageSize, ok := parseOptionalInt(w, r.URL.Query().Get("pageSize"), "pageSize")
	if !ok {
		return
	}
	page, err := s.listAIGradingRequests.Execute(r.Context(), domain.ListAIGradingRequestsInput{
		Principal:              principal,
		Status:                 domain.AIGradingStatus(r.URL.Query().Get("status")),
		ArchiveItemID:          r.URL.Query().Get("archiveItemId"),
		SourceArchiveOwnerType: domain.OwnerType(r.URL.Query().Get("sourceArchiveOwnerType")),
		StudentID:              r.URL.Query().Get("studentId"),
		PageSize:               pageSize,
		Cursor:                 r.URL.Query().Get("cursor"),
	})
	if handleArchiveError(w, err, "failed to list ai grading requests") {
		return
	}

	writeJSON(w, http.StatusOK, toAIGradingRequestListResponse(page))
}
