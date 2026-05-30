package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/identity-access-gateway/internal/domain"
)

func TestNewStudentAppProfileProjectsOwnStudentPrincipal(t *testing.T) {
	profile, err := domain.NewStudentAppProfile(studentAppPrincipal("user_student"))
	if err != nil {
		t.Fatalf("NewStudentAppProfile returned error: %v", err)
	}
	if profile.StudentID != "user_student" {
		t.Fatalf("StudentID = %q", profile.StudentID)
	}
	if profile.PrincipalID != "user_student" {
		t.Fatalf("PrincipalID = %q", profile.PrincipalID)
	}
	if profile.DisplayName != "Student" {
		t.Fatalf("DisplayName = %q", profile.DisplayName)
	}
	if profile.Role != domain.RoleStudent {
		t.Fatalf("Role = %q", profile.Role)
	}
	if profile.EntryPoint != domain.EntryPointStudentApp {
		t.Fatalf("EntryPoint = %q", profile.EntryPoint)
	}
}

func TestNewStudentAppProfileRejectsNonStudentAppPrincipals(t *testing.T) {
	missingStudentID := studentAppPrincipal("user_student")
	missingStudentID.StudentAccess.StudentIDs = nil

	for name, principal := range map[string]domain.PrincipalContext{
		"teacher":            teacherPrincipal(),
		"remote":             remotePrincipal(),
		"service":            servicePrincipal(),
		"missing student id": missingStudentID,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NewStudentAppProfile(principal)
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
		})
	}
}

func studentAppPrincipal(studentID string) domain.PrincipalContext {
	now := time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)
	return domain.PrincipalContext{
		PrincipalID: "user_student",
		SubjectType: domain.SubjectUser,
		Role:        domain.RoleStudent,
		EntryPoint:  domain.EntryPointStudentApp,
		DisplayName: "Student",
		Scopes: []domain.Scope{
			domain.ScopeIdentityRead,
			domain.ScopeStudentOwnRead,
		},
		KnowledgeAccess: domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessNone},
		StudentAccess:   domain.StudentAccess{Mode: domain.StudentAccessOwn, StudentIDs: []string{studentID}},
		SessionID:       "sess_student",
		IssuedAt:        now,
		ExpiresAt:       now.Add(time.Hour),
	}
}

func teacherPrincipal() domain.PrincipalContext {
	principal := studentAppPrincipal("user_student")
	principal.Role = domain.RoleTeacher
	principal.EntryPoint = domain.EntryPointDesktopTeacher
	principal.StudentAccess = domain.StudentAccess{Mode: domain.StudentAccessAssigned}
	return principal
}

func remotePrincipal() domain.PrincipalContext {
	principal := studentAppPrincipal("user_student")
	principal.SubjectType = domain.SubjectRemoteChannel
	principal.Role = domain.RoleRemoteOperator
	principal.EntryPoint = domain.EntryPointRemoteSocial
	principal.StudentAccess = domain.StudentAccess{Mode: domain.StudentAccessNone}
	return principal
}

func servicePrincipal() domain.PrincipalContext {
	principal := studentAppPrincipal("user_student")
	principal.SubjectType = domain.SubjectService
	principal.Role = domain.RoleService
	principal.EntryPoint = domain.EntryPointAgentInternal
	principal.StudentAccess = domain.StudentAccess{Mode: domain.StudentAccessNone}
	return principal
}
