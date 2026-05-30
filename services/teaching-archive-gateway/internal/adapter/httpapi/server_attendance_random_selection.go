package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type attendanceRandomSelectionRequest struct {
	Count          int                              `json:"count,omitempty"`
	ExcludePresent *bool                            `json:"excludePresent,omitempty"`
	Weighted       *bool                            `json:"weighted,omitempty"`
	Candidates     []attendanceSelectionCandidateIn `json:"candidates"`
}

type attendanceSelectionCandidateIn struct {
	StudentID       string   `json:"studentId"`
	DisplayName     string   `json:"displayName,omitempty"`
	AttendanceCount int      `json:"attendanceCount,omitempty"`
	AbsenceCount    int      `json:"absenceCount,omitempty"`
	LateCount       int      `json:"lateCount,omitempty"`
	RollcallWeight  *float64 `json:"rollcallWeight,omitempty"`
}

type attendanceRandomSelectionResponse struct {
	SessionID      string                              `json:"sessionId"`
	RequestedCount int                                 `json:"requestedCount"`
	EligibleCount  int                                 `json:"eligibleCount"`
	ExcludePresent bool                                `json:"excludePresent"`
	Weighted       bool                                `json:"weighted"`
	Data           []attendanceSelectedStudentResponse `json:"data"`
}

type attendanceSelectedStudentResponse struct {
	StudentID            string  `json:"studentId"`
	DisplayName          *string `json:"displayName,omitempty"`
	SelectionWeight      float64 `json:"selectionWeight"`
	SelectionProbability float64 `json:"selectionProbability"`
}

func (s *Server) selectAttendanceRandomStudentsMetadata(w http.ResponseWriter, r *http.Request, sessionID string) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.selectAttendanceRandomStudents == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "attendance random selection use case is not configured")
		return
	}

	var request attendanceRandomSelectionRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	input := domain.AttendanceRandomSelectionInput{
		Principal:  principal,
		SessionID:  sessionID,
		Count:      request.Count,
		Candidates: toAttendanceSelectionCandidates(request.Candidates),
	}
	if request.ExcludePresent != nil {
		input.ExcludePresent = *request.ExcludePresent
		input.HasExcludePresent = true
	}
	if request.Weighted != nil {
		input.Weighted = *request.Weighted
		input.HasWeighted = true
	}

	selection, err := s.selectAttendanceRandomStudents.Execute(r.Context(), input)
	if handleArchiveError(w, err, "failed to select attendance random students") {
		return
	}
	writeJSON(w, http.StatusOK, toAttendanceRandomSelectionResponse(selection))
}

func toAttendanceSelectionCandidates(
	candidates []attendanceSelectionCandidateIn,
) []domain.AttendanceSelectionCandidate {
	out := make([]domain.AttendanceSelectionCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		selectionCandidate := domain.AttendanceSelectionCandidate{
			StudentID:       candidate.StudentID,
			DisplayName:     candidate.DisplayName,
			AttendanceCount: candidate.AttendanceCount,
			AbsenceCount:    candidate.AbsenceCount,
			LateCount:       candidate.LateCount,
		}
		if candidate.RollcallWeight != nil {
			selectionCandidate.RollcallWeight = *candidate.RollcallWeight
			selectionCandidate.HasRollcallWeight = true
		}
		out = append(out, selectionCandidate)
	}
	return out
}

func toAttendanceRandomSelectionResponse(
	selection domain.AttendanceRandomSelection,
) attendanceRandomSelectionResponse {
	selected := make([]attendanceSelectedStudentResponse, 0, len(selection.Selected))
	for _, student := range selection.Selected {
		selected = append(selected, attendanceSelectedStudentResponse{
			StudentID:            student.StudentID,
			DisplayName:          optionalString(student.DisplayName),
			SelectionWeight:      student.SelectionWeight,
			SelectionProbability: student.SelectionProbability,
		})
	}
	return attendanceRandomSelectionResponse{
		SessionID:      selection.SessionID,
		RequestedCount: selection.RequestedCount,
		EligibleCount:  selection.EligibleCount,
		ExcludePresent: selection.ExcludePresent,
		Weighted:       selection.Weighted,
		Data:           selected,
	}
}
