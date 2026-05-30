package domain

import (
	"math"
	"strings"
	"time"
)

const (
	maxAttendanceSignInCodeLength    = 256
	maxAttendanceSignInGesturePoints = 32
	attendanceSignInTimestampWindow  = time.Minute
)

type AttendanceSignInMethod string

const (
	AttendanceSignInMethodQR      AttendanceSignInMethod = "QR"
	AttendanceSignInMethodGesture AttendanceSignInMethod = "GESTURE"
	AttendanceSignInMethodNumber  AttendanceSignInMethod = "NUMBER"
)

type AttendanceSignInInput struct {
	Principal       PrincipalContext
	SessionID       string
	StudentID       string
	Method          AttendanceSignInMethod
	TimestampMillis int64
	HasTimestamp    bool
	Code            string
	Gesture         []int
}

func NormalizeAttendanceSignInInput(input AttendanceSignInInput, now time.Time) (AttendanceSignInInput, error) {
	studentID, err := authorizeAttendanceSignInPrincipal(input.Principal)
	if err != nil {
		return AttendanceSignInInput{}, err
	}
	sessionID, err := NormalizeAttendanceSessionID(input.SessionID)
	if err != nil {
		return AttendanceSignInInput{}, err
	}
	method, err := normalizeAttendanceSignInMethod(input.Method)
	if err != nil {
		return AttendanceSignInInput{}, err
	}
	if err := validateAttendanceSignInTimestamp(input, now); err != nil {
		return AttendanceSignInInput{}, err
	}
	code, err := normalizeOptionalText(input.Code, maxAttendanceSignInCodeLength, "code")
	if err != nil {
		return AttendanceSignInInput{}, err
	}
	if len(input.Gesture) > maxAttendanceSignInGesturePoints {
		return AttendanceSignInInput{}, validationError("gesture contains too many points")
	}

	return AttendanceSignInInput{
		Principal:       input.Principal,
		SessionID:       sessionID,
		StudentID:       studentID,
		Method:          method,
		TimestampMillis: input.TimestampMillis,
		HasTimestamp:    input.HasTimestamp,
		Code:            code,
		Gesture:         append([]int(nil), input.Gesture...),
	}, nil
}

func NewAttendanceSignInRecord(
	id string,
	session AttendanceSession,
	input AttendanceSignInInput,
	now time.Time,
) (AttendanceRecord, error) {
	normalized, err := NormalizeAttendanceSignInInput(input, now)
	if err != nil {
		return AttendanceRecord{}, err
	}
	if normalized.SessionID != session.ID {
		return AttendanceRecord{}, validationError("sessionId does not match attendance session")
	}
	if err := requireSignInCompatibleSession(session, normalized.Method); err != nil {
		return AttendanceRecord{}, err
	}
	return NewAttendanceRecord(id, session, CreateAttendanceRecordInput{
		Principal: normalized.Principal,
		SessionID: normalized.SessionID,
		StudentID: normalized.StudentID,
		Status:    AttendanceRecordStatusPresent,
	}, now)
}

func authorizeAttendanceSignInPrincipal(principal PrincipalContext) (string, error) {
	if err := ValidatePrincipalContext(principal); err != nil {
		return "", err
	}
	if principal.Role != RoleStudent || principal.EntryPoint != EntryPointStudentApp {
		return "", ErrForbidden
	}
	if !hasScope(principal, ScopeStudentOwnWrite) || principal.StudentAccess.Mode != StudentAccessOwn {
		return "", ErrForbidden
	}
	studentID, err := normalizeRequiredText(primaryOwnStudentID(principal), maxArchiveStudentIDLength, "studentId")
	if err != nil {
		return "", err
	}
	if !ownsStudent(principal, studentID) {
		return "", ErrForbidden
	}
	return studentID, nil
}

func normalizeAttendanceSignInMethod(method AttendanceSignInMethod) (AttendanceSignInMethod, error) {
	switch strings.ToUpper(strings.TrimSpace(string(method))) {
	case "QR", "QRCODE":
		return AttendanceSignInMethodQR, nil
	case "GESTURE":
		return AttendanceSignInMethodGesture, nil
	case "NUMBER":
		return AttendanceSignInMethodNumber, nil
	default:
		return "", validationError("method is unsupported")
	}
}

func validateAttendanceSignInTimestamp(input AttendanceSignInInput, now time.Time) error {
	if !input.HasTimestamp {
		return nil
	}
	if input.TimestampMillis <= 0 {
		return validationError("timestampMillis is invalid")
	}
	signInAt := time.UnixMilli(input.TimestampMillis).UTC()
	delta := now.UTC().Sub(signInAt)
	if math.Abs(float64(delta)) > float64(attendanceSignInTimestampWindow) {
		return validationError("timestampMillis is expired")
	}
	return nil
}

func requireSignInCompatibleSession(session AttendanceSession, method AttendanceSignInMethod) error {
	if session.Status != AttendanceSessionStatusActive {
		return ErrAttendanceSessionNotActive
	}
	switch method {
	case AttendanceSignInMethodQR:
		if session.SessionType == AttendanceSessionTypeQRCode {
			return nil
		}
	case AttendanceSignInMethodGesture:
		if session.SessionType == AttendanceSessionTypeGesture {
			return nil
		}
	case AttendanceSignInMethodNumber:
		if session.SessionType == AttendanceSessionTypeNumber {
			return nil
		}
	}
	return validationError("method does not match attendance session type")
}
