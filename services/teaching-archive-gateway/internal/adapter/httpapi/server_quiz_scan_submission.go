package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (s *Server) quizScanSubmissions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.createScannedQuizSubmissionMetadata(w, r)
}

func (s *Server) createScannedQuizSubmissionMetadata(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.createScannedQuizSubmission == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "quiz scan submission use case is not configured")
		return
	}

	var request createScannedQuizSubmissionRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	created, err := s.createScannedQuizSubmission.Execute(r.Context(), domain.CreateScannedQuizSubmissionInput{
		Principal: principal,
		ScanCode:  request.ScanCode,
		AnswerRef: request.AnswerRef,
	})
	if handleArchiveError(w, err, "failed to create quiz scan submission") {
		return
	}
	writeJSON(w, http.StatusCreated, toQuizSubmissionResponse(created))
}
