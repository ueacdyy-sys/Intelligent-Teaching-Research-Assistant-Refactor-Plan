package httpapi

import (
	"net/http"

	"ita-refactor/services/identity-access-gateway/internal/domain"
)

type studentAppProfileResponse struct {
	StudentID   string      `json:"studentId"`
	PrincipalID string      `json:"principalId"`
	DisplayName *string     `json:"displayName"`
	Role        domain.Role `json:"role"`
	EntryPoint  string      `json:"entryPoint"`
	SessionID   string      `json:"sessionId"`
	IssuedAt    string      `json:"issuedAt"`
	ExpiresAt   string      `json:"expiresAt"`
}

func (s *Server) getStudentAppProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	token := bearerToken(r.Header.Get("Authorization"))
	if token == "" {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing bearer token")
		return
	}
	profile, err := s.identity.GetStudentAppProfile(r.Context(), token)
	if handleUsecaseError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, toStudentAppProfileResponse(profile))
}

func toStudentAppProfileResponse(profile domain.StudentAppProfile) studentAppProfileResponse {
	return studentAppProfileResponse{
		StudentID:   profile.StudentID,
		PrincipalID: profile.PrincipalID,
		DisplayName: stringPtrOrNil(profile.DisplayName),
		Role:        profile.Role,
		EntryPoint:  string(profile.EntryPoint),
		SessionID:   profile.SessionID,
		IssuedAt:    formatTime(profile.IssuedAt),
		ExpiresAt:   formatTime(profile.ExpiresAt),
	}
}
