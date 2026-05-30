package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestEndAttendanceSessionTransitionsActiveSession(t *testing.T) {
	endedAt := time.Date(2026, 5, 30, 20, 5, 0, 0, time.FixedZone("CST", 8*60*60))

	session, changed, err := domain.EndAttendanceSession(
		activeAttendanceSession(),
		domain.EndAttendanceSessionInput{
			Principal: teacherPrincipal(),
			SessionID: " att_sess_domain ",
		},
		endedAt,
	)
	if err != nil {
		t.Fatalf("EndAttendanceSession returned error: %v", err)
	}
	if !changed {
		t.Fatal("changed = false, want true")
	}
	if session.Status != domain.AttendanceSessionStatusEnded {
		t.Fatalf("Status = %q", session.Status)
	}
	if session.EndedAt.Location() != time.UTC {
		t.Fatalf("EndedAt location = %v, want UTC", session.EndedAt.Location())
	}
	if !session.EndedAt.Equal(endedAt.UTC()) {
		t.Fatalf("EndedAt = %s", session.EndedAt)
	}
}

func TestEndAttendanceSessionReturnsAlreadyEndedSession(t *testing.T) {
	originalEndedAt := time.Date(2026, 5, 30, 12, 15, 0, 0, time.UTC)
	session := activeAttendanceSession()
	session.Status = domain.AttendanceSessionStatusEnded
	session.EndedAt = originalEndedAt

	ended, changed, err := domain.EndAttendanceSession(
		session,
		domain.EndAttendanceSessionInput{
			Principal: teacherPrincipal(),
			SessionID: "att_sess_domain",
		},
		time.Date(2026, 5, 30, 12, 20, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("EndAttendanceSession returned error: %v", err)
	}
	if changed {
		t.Fatal("changed = true, want idempotent no-op")
	}
	if !ended.EndedAt.Equal(originalEndedAt) {
		t.Fatalf("EndedAt = %s", ended.EndedAt)
	}
}

func TestEndAttendanceSessionRejectsBadSessionID(t *testing.T) {
	_, _, err := domain.EndAttendanceSession(
		activeAttendanceSession(),
		domain.EndAttendanceSessionInput{
			Principal: teacherPrincipal(),
			SessionID: "session_bad",
		},
		time.Date(2026, 5, 30, 12, 20, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestAuthorizeEndAttendanceSessionAllowsDesktopAdmin(t *testing.T) {
	err := domain.AuthorizeEndAttendanceSession(adminPrincipalForAttendanceEnd())
	if err != nil {
		t.Fatalf("AuthorizeEndAttendanceSession returned error: %v", err)
	}
}

func TestAuthorizeEndAttendanceSessionRejectsStudentAndService(t *testing.T) {
	for name, principal := range map[string]domain.PrincipalContext{
		"student": studentPrincipal("student_001"),
		"service": servicePrincipal(),
	} {
		err := domain.AuthorizeEndAttendanceSession(principal)
		if !errors.Is(err, domain.ErrForbidden) {
			t.Fatalf("%s error = %v, want ErrForbidden", name, err)
		}
	}
}

func adminPrincipalForAttendanceEnd() domain.PrincipalContext {
	principal := teacherPrincipal()
	principal.PrincipalID = "admin_001"
	principal.Role = domain.RoleAdmin
	principal.KnowledgeAccess.Private = domain.PrivateAccessAll
	principal.StudentAccess.Mode = domain.StudentAccessAll
	return principal
}
