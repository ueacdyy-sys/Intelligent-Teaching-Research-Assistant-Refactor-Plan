package domain

import (
	"strings"
	"time"
)

type StudentAppProfile struct {
	StudentID   string
	PrincipalID string
	DisplayName string
	Role        Role
	EntryPoint  EntryPoint
	SessionID   string
	IssuedAt    time.Time
	ExpiresAt   time.Time
}

func NewStudentAppProfile(principal PrincipalContext) (StudentAppProfile, error) {
	if principal.SubjectType != SubjectUser ||
		principal.Role != RoleStudent ||
		principal.EntryPoint != EntryPointStudentApp ||
		principal.StudentAccess.Mode != StudentAccessOwn ||
		!principalHasScope(principal, ScopeIdentityRead) ||
		len(principal.StudentAccess.StudentIDs) != 1 {
		return StudentAppProfile{}, ErrForbidden
	}
	studentID := strings.TrimSpace(principal.StudentAccess.StudentIDs[0])
	if studentID == "" {
		return StudentAppProfile{}, ErrForbidden
	}
	return StudentAppProfile{
		StudentID:   studentID,
		PrincipalID: strings.TrimSpace(principal.PrincipalID),
		DisplayName: strings.TrimSpace(principal.DisplayName),
		Role:        principal.Role,
		EntryPoint:  principal.EntryPoint,
		SessionID:   strings.TrimSpace(principal.SessionID),
		IssuedAt:    principal.IssuedAt.UTC(),
		ExpiresAt:   principal.ExpiresAt.UTC(),
	}, nil
}

func principalHasScope(principal PrincipalContext, scope Scope) bool {
	for _, item := range principal.Scopes {
		if item == scope {
			return true
		}
	}
	return false
}
