package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type createAttendanceRecordRequest struct {
	StudentID string                        `json:"studentId"`
	Status    domain.AttendanceRecordStatus `json:"status"`
	Note      string                        `json:"note,omitempty"`
}

type attendanceRecordResponse struct {
	ID                    string                        `json:"id"`
	SessionID             string                        `json:"sessionId"`
	StudentID             string                        `json:"studentId"`
	Status                domain.AttendanceRecordStatus `json:"status"`
	RecordedByPrincipalID string                        `json:"recordedByPrincipalId"`
	SignTime              *string                       `json:"signTime,omitempty"`
	Note                  *string                       `json:"note,omitempty"`
	CreatedAt             string                        `json:"createdAt"`
}

func (s *Server) attendanceSessionSubresources(w http.ResponseWriter, r *http.Request) {
	if sessionID, ok := parseAttendanceSessionRandomSelectionsPath(r.URL.Path); ok {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.selectAttendanceRandomStudentsMetadata(w, r, sessionID)
		return
	}

	if sessionID, ok := parseAttendanceSessionEndPath(r.URL.Path); ok {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.endAttendanceSessionMetadata(w, r, sessionID)
		return
	}

	if sessionID, ok := parseAttendanceSessionSignInsPath(r.URL.Path); ok {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.signInAttendanceMetadata(w, r, sessionID)
		return
	}

	sessionID, ok := parseAttendanceSessionRecordsPath(r.URL.Path)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "attendance session subresource not found")
		return
	}
	switch r.Method {
	case http.MethodGet:
		s.listAttendanceRecordMetadata(w, r, sessionID)
	case http.MethodPost:
		s.createAttendanceRecordMetadata(w, r, sessionID)
	default:
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
	}
}

func (s *Server) createAttendanceRecordMetadata(w http.ResponseWriter, r *http.Request, sessionID string) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.createAttendanceRecord == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "attendance record use case is not configured")
		return
	}

	var request createAttendanceRecordRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	result, err := s.createAttendanceRecord.Execute(r.Context(), domain.CreateAttendanceRecordInput{
		Principal: principal,
		SessionID: sessionID,
		StudentID: request.StudentID,
		Status:    request.Status,
		Note:      request.Note,
	})
	if handleArchiveError(w, err, "failed to create attendance record") {
		return
	}

	status := http.StatusOK
	if result.Created {
		status = http.StatusCreated
	}
	writeJSON(w, status, toAttendanceRecordResponse(result.Record))
}

func (s *Server) listAttendanceRecordMetadata(w http.ResponseWriter, r *http.Request, sessionID string) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.listAttendanceRecords == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "attendance record list use case is not configured")
		return
	}

	pageSize, ok := parseOptionalInt(w, r.URL.Query().Get("pageSize"), "pageSize")
	if !ok {
		return
	}
	page, err := s.listAttendanceRecords.Execute(r.Context(), domain.ListAttendanceRecordsInput{
		Principal: principal,
		SessionID: sessionID,
		StudentID: r.URL.Query().Get("studentId"),
		PageSize:  pageSize,
		Cursor:    r.URL.Query().Get("cursor"),
	})
	if handleArchiveError(w, err, "failed to list attendance records") {
		return
	}

	writeJSON(w, http.StatusOK, toAttendanceRecordListResponse(page))
}

func toAttendanceRecordResponse(record domain.AttendanceRecord) attendanceRecordResponse {
	return attendanceRecordResponse{
		ID:                    record.ID,
		SessionID:             record.SessionID,
		StudentID:             record.StudentID,
		Status:                record.Status,
		RecordedByPrincipalID: record.RecordedByPrincipalID,
		SignTime:              optionalTime(record.SignTime),
		Note:                  optionalString(record.Note),
		CreatedAt:             formatTime(record.CreatedAt),
	}
}

func toAttendanceRecordListResponse(page domain.AttendanceRecordPage) struct {
	Data     []attendanceRecordResponse `json:"data"`
	PageInfo pageInfoResponse           `json:"pageInfo"`
} {
	records := make([]attendanceRecordResponse, 0, len(page.Items))
	for _, record := range page.Items {
		records = append(records, toAttendanceRecordResponse(record))
	}
	return struct {
		Data     []attendanceRecordResponse `json:"data"`
		PageInfo pageInfoResponse           `json:"pageInfo"`
	}{
		Data: records,
		PageInfo: pageInfoResponse{
			PageSize:   page.PageInfo.PageSize,
			HasMore:    page.PageInfo.HasMore,
			NextCursor: optionalString(page.PageInfo.NextCursor),
		},
	}
}
