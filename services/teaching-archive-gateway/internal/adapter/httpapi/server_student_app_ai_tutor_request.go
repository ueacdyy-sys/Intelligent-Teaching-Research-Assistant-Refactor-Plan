package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (s *Server) studentAppAITutorRequests(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.createStudentAppAITutorRequestMetadata(w, r)
}

func (s *Server) createStudentAppAITutorRequestMetadata(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.createStudentAppAITutorRequest == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student app ai tutor request use case is not configured")
		return
	}

	var request createStudentAppAITutorRequestRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	created, err := s.createStudentAppAITutorRequest.Execute(r.Context(), domain.CreateStudentAppAITutorRequestInput{
		Principal:            principal,
		StudentArchiveItemID: request.StudentArchiveItemID,
		AnalysisGoal:         request.AnalysisGoal,
		QuestionBankIntent:   request.QuestionBankIntent,
	})
	if handleArchiveError(w, err, "failed to create student app ai tutor request") {
		return
	}
	writeJSON(w, http.StatusCreated, toTutoringAnalysisRequestResponse(created))
}
