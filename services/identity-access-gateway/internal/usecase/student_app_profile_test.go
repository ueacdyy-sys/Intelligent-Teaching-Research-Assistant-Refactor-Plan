package usecase_test

import (
	"context"
	"errors"
	"testing"

	"ita-refactor/services/identity-access-gateway/internal/domain"
)

func TestGetStudentAppProfileProjectsStudentSession(t *testing.T) {
	service := newTestService()
	session, err := service.CreatePasswordSession(context.Background(), domain.PasswordSessionInput{
		Identifier:    "student001",
		Password:      "ueacd",
		RequestedRole: domain.RoleStudent,
		EntryPoint:    domain.EntryPointStudentApp,
	})
	if err != nil {
		t.Fatalf("CreatePasswordSession error = %v", err)
	}

	profile, err := service.GetStudentAppProfile(context.Background(), session.AccessToken)
	if err != nil {
		t.Fatalf("GetStudentAppProfile error = %v", err)
	}
	if profile.StudentID != "user_student" {
		t.Fatalf("StudentID = %q", profile.StudentID)
	}
	if profile.SessionID != session.Principal.SessionID {
		t.Fatalf("SessionID = %q", profile.SessionID)
	}
}

func TestGetStudentAppProfileRejectsTeacherSession(t *testing.T) {
	service := newTestService()
	session, err := service.CreatePasswordSession(context.Background(), domain.PasswordSessionInput{
		Identifier:    "teacher@example.com",
		Password:      "ueacd",
		RequestedRole: domain.RoleTeacher,
		EntryPoint:    domain.EntryPointDesktopTeacher,
	})
	if err != nil {
		t.Fatalf("CreatePasswordSession error = %v", err)
	}

	_, err = service.GetStudentAppProfile(context.Background(), session.AccessToken)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}
