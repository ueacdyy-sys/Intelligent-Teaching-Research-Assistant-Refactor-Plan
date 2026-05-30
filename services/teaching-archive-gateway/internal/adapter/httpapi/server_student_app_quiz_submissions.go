package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (s *Server) studentAppQuizSubmissions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.listStudentAppQuizSubmissionMetadata(w, r)
}

func (s *Server) listStudentAppQuizSubmissionMetadata(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.listStudentAppQuizSubmissions == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student app quiz submissions use case is not configured")
		return
	}

	pageSize, ok := parseOptionalInt(w, r.URL.Query().Get("pageSize"), "pageSize")
	if !ok {
		return
	}
	page, err := s.listStudentAppQuizSubmissions.Execute(r.Context(), domain.ListStudentAppQuizSubmissionsInput{
		Principal:         principal,
		QuizArchiveItemID: r.URL.Query().Get("quizArchiveItemId"),
		PageSize:          pageSize,
		Cursor:            r.URL.Query().Get("cursor"),
	})
	if handleArchiveError(w, err, "failed to list student app quiz submissions") {
		return
	}
	writeJSON(w, http.StatusOK, toQuizSubmissionListResponse(page))
}
