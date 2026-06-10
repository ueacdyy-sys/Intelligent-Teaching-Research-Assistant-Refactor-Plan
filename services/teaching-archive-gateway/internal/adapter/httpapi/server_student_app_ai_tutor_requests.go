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
	cards, err := buildStudentAppAITutorRequestProgressCards(page.Items)
	if handleArchiveError(w, err, "failed to build student app ai tutor request progress") {
		return
	}
	etag := studentAppAITutorRequestProgressListETag(cards, page.PageInfo)
	writePrivateConditionalJSONWithETag(w, r, http.StatusOK, etag, func() any {
		return toStudentAppAITutorRequestProgressListResponseFromCards(cards, page.PageInfo)
	})
}

func (s *Server) readStudentAppAITutorRequestProgressMetadata(
	w http.ResponseWriter,
	r *http.Request,
	requestID string,
) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.readStudentAppAITutorRequestProgress == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student app ai tutor request progress use case is not configured")
		return
	}

	card, err := s.readStudentAppAITutorRequestProgress.Execute(
		r.Context(),
		domain.ReadStudentAppAITutorRequestProgressInput{
			Principal: principal,
			RequestID: requestID,
		},
	)
	if handleArchiveError(w, err, "failed to read student app ai tutor request progress") {
		return
	}
	etag := studentAppAITutorRequestProgressETag(card)
	writePrivateConditionalJSONWithETag(w, r, http.StatusOK, etag, func() any {
		return toStudentAppAITutorRequestProgressResponse(card)
	})
}
