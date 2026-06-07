package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (s *Server) studentAppQuestionBankDraftContent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.readStudentAppQuestionBankDraftContent(w, r)
}

func (s *Server) readStudentAppQuestionBankDraftContent(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.readStudentAppQuestionBankDraftContentUseCase == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student app question bank draft content use case is not configured")
		return
	}

	content, err := s.readStudentAppQuestionBankDraftContentUseCase.Execute(
		r.Context(),
		domain.ReadStudentAppQuestionBankDraftContentInput{
			Principal:            principal,
			QuestionBankDraftRef: r.URL.Query().Get("questionBankDraftRef"),
		},
	)
	if handleArchiveError(w, err, "failed to read student app question bank draft content") {
		return
	}
	writeJSON(w, http.StatusOK, toStudentAppQuestionBankDraftContentResponse(content))
}
