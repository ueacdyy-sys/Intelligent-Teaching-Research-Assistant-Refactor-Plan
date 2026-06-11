package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (s *Server) studentAppQuestionBankDrafts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.listStudentAppQuestionBankDraftMetadata(w, r)
}

func (s *Server) listStudentAppQuestionBankDraftMetadata(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.listStudentAppQuestionBankDrafts == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student app question bank drafts use case is not configured")
		return
	}

	pageSize, ok := parseOptionalInt(w, r.URL.Query().Get("pageSize"), "pageSize")
	if !ok {
		return
	}
	page, err := s.listStudentAppQuestionBankDrafts.Execute(r.Context(), domain.ListStudentAppQuestionBankDraftsInput{
		Principal: principal,
		PageSize:  pageSize,
		Cursor:    r.URL.Query().Get("cursor"),
	})
	if handleArchiveError(w, err, "failed to list student app question bank drafts") {
		return
	}
	writeJSON(w, http.StatusOK, toStudentAppQuestionBankDraftListResponse(page))
}

func (s *Server) readStudentAppQuestionBankDraftSummaryMetadata(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.readStudentAppQuestionBankDraftSummary == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student app question bank draft summary use case is not configured")
		return
	}

	summary, err := s.readStudentAppQuestionBankDraftSummary.Execute(
		r.Context(),
		domain.ReadStudentAppQuestionBankDraftSummaryInput{
			Principal: principal,
		},
	)
	if handleArchiveError(w, err, "failed to read student app question bank draft summary") {
		return
	}
	etag := studentAppQuestionBankDraftSummaryETag(summary)
	writePrivateConditionalJSONWithETag(w, r, http.StatusOK, etag, func() any {
		return toStudentAppQuestionBankDraftSummaryOnlyResponse(summary)
	})
}
