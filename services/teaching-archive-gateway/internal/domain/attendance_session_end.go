package domain

import "time"

type EndAttendanceSessionInput struct {
	Principal PrincipalContext
	SessionID string
}

func EndAttendanceSession(
	session AttendanceSession,
	input EndAttendanceSessionInput,
	endedAt time.Time,
) (AttendanceSession, bool, error) {
	normalized, err := NormalizeEndAttendanceSessionInput(input)
	if err != nil {
		return AttendanceSession{}, false, err
	}
	if session.ID != normalized.SessionID {
		return AttendanceSession{}, false, validationError("sessionId does not match attendance session")
	}
	if session.Status == AttendanceSessionStatusEnded {
		return session, false, nil
	}
	if session.Status != AttendanceSessionStatusActive {
		return AttendanceSession{}, false, ErrAttendanceSessionNotActive
	}

	session.Status = AttendanceSessionStatusEnded
	session.EndedAt = endedAt.UTC()
	return session, true, nil
}

func NormalizeEndAttendanceSessionInput(
	input EndAttendanceSessionInput,
) (EndAttendanceSessionInput, error) {
	if err := AuthorizeEndAttendanceSession(input.Principal); err != nil {
		return EndAttendanceSessionInput{}, err
	}
	sessionID, err := NormalizeAttendanceSessionID(input.SessionID)
	if err != nil {
		return EndAttendanceSessionInput{}, err
	}
	return EndAttendanceSessionInput{
		Principal: input.Principal,
		SessionID: sessionID,
	}, nil
}

func AuthorizeEndAttendanceSession(principal PrincipalContext) error {
	if err := ValidatePrincipalContext(principal); err != nil {
		return err
	}
	if err := requireScope(principal, ScopeTeachingWrite); err != nil {
		return err
	}
	if principal.SubjectType != SubjectUser || principal.EntryPoint != EntryPointDesktopTeacher {
		return ErrForbidden
	}
	if principal.Role == RoleTeacher || principal.Role == RoleAdmin {
		return nil
	}
	return ErrForbidden
}
