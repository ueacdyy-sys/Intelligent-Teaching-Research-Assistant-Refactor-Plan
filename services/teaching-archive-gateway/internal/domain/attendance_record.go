package domain

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

const maxAttendanceRecordNoteLength = 1000

var (
	ErrAttendanceSessionNotFound  = errors.New("attendance session not found")
	ErrAttendanceSessionNotActive = errors.New("attendance session is not active")
)

type AttendanceRecordStatus string

const (
	AttendanceRecordStatusPresent AttendanceRecordStatus = "PRESENT"
	AttendanceRecordStatusAbsent  AttendanceRecordStatus = "ABSENT"
	AttendanceRecordStatusLate    AttendanceRecordStatus = "LATE"
	AttendanceRecordStatusLeave   AttendanceRecordStatus = "LEAVE"
)

type AttendanceRecord struct {
	ID                    string
	SessionID             string
	StudentID             string
	Status                AttendanceRecordStatus
	RecordedByPrincipalID string
	SignTime              time.Time
	Note                  string
	CreatedAt             time.Time
}

type CreateAttendanceRecordInput struct {
	Principal PrincipalContext
	SessionID string
	StudentID string
	Status    AttendanceRecordStatus
	Note      string
}

func NewAttendanceRecord(
	id string,
	session AttendanceSession,
	input CreateAttendanceRecordInput,
	now time.Time,
) (AttendanceRecord, error) {
	normalized, err := NormalizeCreateAttendanceRecordInput(input)
	if err != nil {
		return AttendanceRecord{}, err
	}
	if err := AuthorizeCreateAttendanceRecord(normalized.Principal, normalized.StudentID); err != nil {
		return AttendanceRecord{}, err
	}
	if session.Status != AttendanceSessionStatusActive {
		return AttendanceRecord{}, ErrAttendanceSessionNotActive
	}
	if normalized.SessionID != "" && normalized.SessionID != session.ID {
		return AttendanceRecord{}, validationError("sessionId does not match attendance session")
	}
	if !strings.HasPrefix(id, "att_rec_") {
		return AttendanceRecord{}, fmt.Errorf("generated attendance record id must use att_rec_ prefix")
	}

	createdAt := now.UTC()
	signTime := time.Time{}
	if normalized.Status == AttendanceRecordStatusPresent || normalized.Status == AttendanceRecordStatusLate {
		signTime = createdAt
	}

	return AttendanceRecord{
		ID:                    id,
		SessionID:             session.ID,
		StudentID:             normalized.StudentID,
		Status:                normalized.Status,
		RecordedByPrincipalID: strings.TrimSpace(normalized.Principal.PrincipalID),
		SignTime:              signTime,
		Note:                  normalized.Note,
		CreatedAt:             createdAt,
	}, nil
}

func NormalizeCreateAttendanceRecordInput(
	input CreateAttendanceRecordInput,
) (CreateAttendanceRecordInput, error) {
	sessionID := strings.TrimSpace(input.SessionID)
	studentID, err := normalizeRequiredText(input.StudentID, maxArchiveStudentIDLength, "studentId")
	if err != nil {
		return CreateAttendanceRecordInput{}, err
	}
	status := AttendanceRecordStatus(strings.ToUpper(strings.TrimSpace(string(input.Status))))
	if !validAttendanceRecordStatus(status) {
		return CreateAttendanceRecordInput{}, validationError("status is unsupported")
	}
	note, err := normalizeOptionalText(input.Note, maxAttendanceRecordNoteLength, "note")
	if err != nil {
		return CreateAttendanceRecordInput{}, err
	}

	return CreateAttendanceRecordInput{
		Principal: input.Principal,
		SessionID: sessionID,
		StudentID: studentID,
		Status:    status,
		Note:      note,
	}, nil
}

func AuthorizeCreateAttendanceRecord(principal PrincipalContext, studentID string) error {
	if err := ValidatePrincipalContext(principal); err != nil {
		return err
	}
	studentID = strings.TrimSpace(studentID)
	if hasScope(principal, ScopeTeachingWrite) && hasAssignedStudentAccess(principal, studentID) {
		return nil
	}
	if canWriteOwnStudentArchive(principal, studentID) {
		return nil
	}
	return ErrForbidden
}

func validAttendanceRecordStatus(value AttendanceRecordStatus) bool {
	switch value {
	case AttendanceRecordStatusPresent, AttendanceRecordStatusAbsent, AttendanceRecordStatusLate, AttendanceRecordStatusLeave:
		return true
	default:
		return false
	}
}
