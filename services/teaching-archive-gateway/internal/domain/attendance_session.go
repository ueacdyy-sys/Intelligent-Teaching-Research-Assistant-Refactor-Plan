package domain

import (
	"fmt"
	"strings"
	"time"
)

const (
	maxAttendanceClassNameLength = 128
	maxAttendanceConfigRefLength = 1000
	maxExpectedStudentCount      = 10000
)

type AttendanceSessionType string

const (
	AttendanceSessionTypeRandom  AttendanceSessionType = "RANDOM"
	AttendanceSessionTypeQRCode  AttendanceSessionType = "QRCODE"
	AttendanceSessionTypeGesture AttendanceSessionType = "GESTURE"
	AttendanceSessionTypeNumber  AttendanceSessionType = "NUMBER"
)

type AttendanceSessionStatus string

const (
	AttendanceSessionStatusActive AttendanceSessionStatus = "ACTIVE"
	AttendanceSessionStatusEnded  AttendanceSessionStatus = "ENDED"
)

type AttendanceSession struct {
	ID                   string
	SessionType          AttendanceSessionType
	ClassName            string
	ExpectedStudentCount int
	PresentCount         int
	AbsentCount          int
	LateCount            int
	ConfigRef            string
	Status               AttendanceSessionStatus
	CreatedByPrincipalID string
	CreatedAt            time.Time
	EndedAt              time.Time
}

type CreateAttendanceSessionInput struct {
	Principal            PrincipalContext
	SessionType          AttendanceSessionType
	ClassName            string
	ExpectedStudentCount int
	ConfigRef            string
}

func NewAttendanceSession(
	id string,
	input CreateAttendanceSessionInput,
	createdAt time.Time,
) (AttendanceSession, error) {
	normalized, err := NormalizeCreateAttendanceSessionInput(input)
	if err != nil {
		return AttendanceSession{}, err
	}
	if err := AuthorizeCreateAttendanceSession(normalized.Principal); err != nil {
		return AttendanceSession{}, err
	}
	if !strings.HasPrefix(id, "att_sess_") {
		return AttendanceSession{}, fmt.Errorf("generated attendance session id must use att_sess_ prefix")
	}

	return AttendanceSession{
		ID:                   id,
		SessionType:          normalized.SessionType,
		ClassName:            normalized.ClassName,
		ExpectedStudentCount: normalized.ExpectedStudentCount,
		PresentCount:         0,
		AbsentCount:          0,
		LateCount:            0,
		ConfigRef:            normalized.ConfigRef,
		Status:               AttendanceSessionStatusActive,
		CreatedByPrincipalID: strings.TrimSpace(normalized.Principal.PrincipalID),
		CreatedAt:            createdAt.UTC(),
	}, nil
}

func NormalizeCreateAttendanceSessionInput(
	input CreateAttendanceSessionInput,
) (CreateAttendanceSessionInput, error) {
	sessionType := AttendanceSessionType(strings.ToUpper(strings.TrimSpace(string(input.SessionType))))
	if !validAttendanceSessionType(sessionType) {
		return CreateAttendanceSessionInput{}, validationError("sessionType is unsupported")
	}
	className, err := normalizeOptionalText(input.ClassName, maxAttendanceClassNameLength, "className")
	if err != nil {
		return CreateAttendanceSessionInput{}, err
	}
	if input.ExpectedStudentCount < 0 || input.ExpectedStudentCount > maxExpectedStudentCount {
		return CreateAttendanceSessionInput{}, validationError("expectedStudentCount is out of range")
	}
	configRef, err := normalizeOptionalText(input.ConfigRef, maxAttendanceConfigRefLength, "configRef")
	if err != nil {
		return CreateAttendanceSessionInput{}, err
	}

	return CreateAttendanceSessionInput{
		Principal:            input.Principal,
		SessionType:          sessionType,
		ClassName:            className,
		ExpectedStudentCount: input.ExpectedStudentCount,
		ConfigRef:            configRef,
	}, nil
}

func AuthorizeCreateAttendanceSession(principal PrincipalContext) error {
	if err := ValidatePrincipalContext(principal); err != nil {
		return err
	}
	return requireScope(principal, ScopeTeachingWrite)
}

func validAttendanceSessionType(value AttendanceSessionType) bool {
	switch value {
	case AttendanceSessionTypeRandom, AttendanceSessionTypeQRCode, AttendanceSessionTypeGesture, AttendanceSessionTypeNumber:
		return true
	default:
		return false
	}
}
