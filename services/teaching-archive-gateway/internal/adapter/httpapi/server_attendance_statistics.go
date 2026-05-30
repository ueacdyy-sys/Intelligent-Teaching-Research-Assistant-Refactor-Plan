package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type attendanceStatisticsResponse struct {
	TotalStudents   int     `json:"totalStudents"`
	TotalRecords    int     `json:"totalRecords"`
	AttendanceCount int     `json:"attendanceCount"`
	AbsenceCount    int     `json:"absenceCount"`
	LateCount       int     `json:"lateCount"`
	AttendanceRate  float64 `json:"attendanceRate"`
}

func (s *Server) attendanceStatistics(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/v1/teaching/attendance-statistics" {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "attendance statistics not found")
		return
	}
	if r.Method != http.MethodGet {
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
	if s.getAttendanceStatistics == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "attendance statistics use case is not configured")
		return
	}

	stats, err := s.getAttendanceStatistics.Execute(r.Context(), domain.AttendanceStatisticsInput{
		Principal: principal,
		ClassName: r.URL.Query().Get("className"),
	})
	if handleArchiveError(w, err, "failed to get attendance statistics") {
		return
	}
	writeJSON(w, http.StatusOK, toAttendanceStatisticsResponse(stats))
}

func toAttendanceStatisticsResponse(stats domain.AttendanceStatistics) attendanceStatisticsResponse {
	return attendanceStatisticsResponse{
		TotalStudents:   stats.TotalStudents,
		TotalRecords:    stats.TotalRecords,
		AttendanceCount: stats.AttendanceCount,
		AbsenceCount:    stats.AbsenceCount,
		LateCount:       stats.LateCount,
		AttendanceRate:  stats.AttendanceRate,
	}
}
