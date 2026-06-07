package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (s *Server) studentAppArchiveItems(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.listStudentAppArchiveItemMetadata(w, r)
}

func (s *Server) listStudentAppArchiveItemMetadata(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.listStudentAppArchiveItems == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student app archive items use case is not configured")
		return
	}

	pageSize, ok := parseOptionalInt(w, r.URL.Query().Get("pageSize"), "pageSize")
	if !ok {
		return
	}
	page, err := s.listStudentAppArchiveItems.Execute(r.Context(), domain.ListStudentAppArchiveItemsInput{
		Principal:    principal,
		MaterialType: domain.MaterialType(r.URL.Query().Get("materialType")),
		Query:        r.URL.Query().Get("query"),
		PageSize:     pageSize,
		Cursor:       r.URL.Query().Get("cursor"),
	})
	if handleArchiveError(w, err, "failed to list student app archive items") {
		return
	}
	writeJSON(w, http.StatusOK, toListResponse(page))
}

func (s *Server) readStudentAppArchiveItemMetadata(
	w http.ResponseWriter,
	r *http.Request,
	archiveItemID string,
) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.readStudentAppArchiveItem == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student app archive item detail use case is not configured")
		return
	}

	item, err := s.readStudentAppArchiveItem.Execute(r.Context(), domain.ReadStudentAppArchiveItemInput{
		Principal:     principal,
		ArchiveItemID: archiveItemID,
	})
	if handleArchiveError(w, err, "failed to read student app archive item") {
		return
	}
	writeJSON(w, http.StatusOK, toStudentAppArchiveItemMetadataResponse(item))
}

func (s *Server) readStudentAppArchiveItemContentPreviewHTTP(
	w http.ResponseWriter,
	r *http.Request,
	archiveItemID string,
) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.readStudentAppArchiveItemContentPreview == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student app archive item content preview use case is not configured")
		return
	}

	preview, err := s.readStudentAppArchiveItemContentPreview.Execute(
		r.Context(),
		domain.ReadStudentAppArchiveItemContentPreviewInput{
			Principal:     principal,
			ArchiveItemID: archiveItemID,
		},
	)
	if handleArchiveError(w, err, "failed to read student app archive item content preview") {
		return
	}
	writeJSON(w, http.StatusOK, toStudentAppArchiveItemContentPreviewResponse(preview))
}

func (s *Server) renderStudentAppArchiveItemContentPreviewHTTP(
	w http.ResponseWriter,
	r *http.Request,
	archiveItemID string,
) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.renderStudentAppArchiveItemContentPreview == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student app archive item content preview renderer use case is not configured")
		return
	}

	rendered, err := s.renderStudentAppArchiveItemContentPreview.Execute(
		r.Context(),
		domain.ReadStudentAppArchiveItemContentPreviewInput{
			Principal:     principal,
			ArchiveItemID: archiveItemID,
		},
	)
	if handleArchiveError(w, err, "failed to render student app archive item content preview") {
		return
	}
	writeJSON(w, http.StatusOK, toStudentAppArchiveItemContentPreviewRenderResponse(rendered))
}

func (s *Server) readStudentAppArchiveItemStudyPacketHTTP(
	w http.ResponseWriter,
	r *http.Request,
	archiveItemID string,
) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.readStudentAppArchiveItemStudyPacket == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student app archive item study packet use case is not configured")
		return
	}

	packet, err := s.readStudentAppArchiveItemStudyPacket.Execute(
		r.Context(),
		domain.ReadStudentAppArchiveItemInput{
			Principal:     principal,
			ArchiveItemID: archiveItemID,
		},
	)
	if handleArchiveError(w, err, "failed to read student app archive item study packet") {
		return
	}
	writeJSON(w, http.StatusOK, toStudentAppArchiveItemStudyPacketResponse(packet))
}
