package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type createAttendanceSessionRequest struct {
	SessionType          domain.AttendanceSessionType `json:"sessionType"`
	ClassName            string                       `json:"className,omitempty"`
	ExpectedStudentCount int                          `json:"expectedStudentCount,omitempty"`
	ConfigRef            string                       `json:"configRef,omitempty"`
}

type attendanceSessionResponse struct {
	ID                   string                         `json:"id"`
	SessionType          domain.AttendanceSessionType   `json:"sessionType"`
	ClassName            *string                        `json:"className,omitempty"`
	ExpectedStudentCount int                            `json:"expectedStudentCount"`
	PresentCount         int                            `json:"presentCount"`
	AbsentCount          int                            `json:"absentCount"`
	LateCount            int                            `json:"lateCount"`
	ConfigRef            *string                        `json:"configRef,omitempty"`
	Status               domain.AttendanceSessionStatus `json:"status"`
	CreatedByPrincipalID string                         `json:"createdByPrincipalId"`
	CreatedAt            string                         `json:"createdAt"`
	EndedAt              *string                        `json:"endedAt,omitempty"`
}

func (s *Server) attendanceSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.createAttendanceSession == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "attendance session use case is not configured")
		return
	}

	var request createAttendanceSessionRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	created, err := s.createAttendanceSession.Execute(r.Context(), domain.CreateAttendanceSessionInput{
		Principal:            principal,
		SessionType:          request.SessionType,
		ClassName:            request.ClassName,
		ExpectedStudentCount: request.ExpectedStudentCount,
		ConfigRef:            request.ConfigRef,
	})
	if handleArchiveError(w, err, "failed to create attendance session") {
		return
	}

	writeJSON(w, http.StatusCreated, toAttendanceSessionResponse(created))
}

func toAttendanceSessionResponse(session domain.AttendanceSession) attendanceSessionResponse {
	return attendanceSessionResponse{
		ID:                   session.ID,
		SessionType:          session.SessionType,
		ClassName:            optionalString(session.ClassName),
		ExpectedStudentCount: session.ExpectedStudentCount,
		PresentCount:         session.PresentCount,
		AbsentCount:          session.AbsentCount,
		LateCount:            session.LateCount,
		ConfigRef:            optionalString(session.ConfigRef),
		Status:               session.Status,
		CreatedByPrincipalID: session.CreatedByPrincipalID,
		CreatedAt:            formatTime(session.CreatedAt),
		EndedAt:              optionalTime(session.EndedAt),
	}
}
