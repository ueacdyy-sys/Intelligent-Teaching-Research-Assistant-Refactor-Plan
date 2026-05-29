package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (s *Server) aiGradingRequestSubresources(w http.ResponseWriter, r *http.Request) {
	if !parseAIGradingWorkerClaimPath(r.URL.Path) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "ai grading request subresource not found")
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.claimAIGradingRequestMetadata(w, r)
}

func (s *Server) claimAIGradingRequestMetadata(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}

	var request claimAIGradingRequestRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if s.claimAIGradingRequest == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "ai grading claim use case is not configured")
		return
	}

	claimed, found, err := s.claimAIGradingRequest.Execute(
		r.Context(),
		domain.ClaimAIGradingRequestInput{
			Principal:    principal,
			WorkerID:     request.WorkerID,
			LeaseSeconds: request.LeaseSeconds,
		},
	)
	if handleArchiveError(w, err, "failed to claim ai grading request") {
		return
	}
	if !found {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	writeJSON(w, http.StatusOK, toAIGradingWorkerClaimResponse(claimed))
}
