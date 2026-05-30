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
	sessionID, ok := parseAttendanceSessionRecordsPath(r.URL.Path)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "attendance session subresource not found")
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.createAttendanceRecordMetadata(w, r, sessionID)
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
