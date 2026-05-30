package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (s *Server) studentAttendanceRecords(w http.ResponseWriter, r *http.Request) {
	studentID, ok := parseStudentAttendanceRecordsPath(r.URL.Path)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "student attendance subresource not found")
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.listStudentAttendanceRecordMetadata(w, r, studentID)
}

func (s *Server) listStudentAttendanceRecordMetadata(w http.ResponseWriter, r *http.Request, studentID string) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.listStudentAttendanceRecords == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student attendance record list use case is not configured")
		return
	}

	pageSize, ok := parseOptionalInt(w, r.URL.Query().Get("pageSize"), "pageSize")
	if !ok {
		return
	}
	page, err := s.listStudentAttendanceRecords.Execute(r.Context(), domain.ListStudentAttendanceRecordsInput{
		Principal: principal,
		StudentID: studentID,
		PageSize:  pageSize,
		Cursor:    r.URL.Query().Get("cursor"),
	})
	if handleArchiveError(w, err, "failed to list student attendance records") {
		return
	}

	writeJSON(w, http.StatusOK, toAttendanceRecordListResponse(page))
}
