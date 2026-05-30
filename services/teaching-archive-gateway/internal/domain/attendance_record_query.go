package domain

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"
	"unicode/utf8"
)

type ListAttendanceRecordsInput struct {
	Principal PrincipalContext
	SessionID string
	StudentID string
	PageSize  int
	Cursor    string
}

type AttendanceRecordCursor struct {
	CreatedAt time.Time
	ID        string
}

type AttendanceRecordQuery struct {
	SessionID  string
	StudentID  string
	StudentIDs []string
	PageSize   int
	FetchLimit int
	Cursor     *AttendanceRecordCursor
}

type AttendanceRecordPage struct {
	Items    []AttendanceRecord
	PageInfo ArchivePageInfo
}

type attendanceRecordCursorPayload struct {
	CreatedAt string `json:"createdAt"`
	ID        string `json:"id"`
}

func NormalizeListAttendanceRecordsInput(input ListAttendanceRecordsInput) (AttendanceRecordQuery, error) {
	sessionID, err := NormalizeAttendanceSessionID(input.SessionID)
	if err != nil {
		return AttendanceRecordQuery{}, err
	}

	studentID := strings.TrimSpace(input.StudentID)
	if utf8.RuneCountInString(studentID) > maxArchiveStudentIDLength {
		return AttendanceRecordQuery{}, validationError("studentId is too long")
	}

	pageSize := input.PageSize
	if pageSize == 0 {
		pageSize = defaultArchivePageSize
	}
	if pageSize < 1 || pageSize > maxArchivePageSize {
		return AttendanceRecordQuery{}, validationError("pageSize must be between 1 and 100")
	}

	var cursor *AttendanceRecordCursor
	if strings.TrimSpace(input.Cursor) != "" {
		decoded, err := DecodeAttendanceRecordCursor(input.Cursor)
		if err != nil {
			return AttendanceRecordQuery{}, err
		}
		cursor = &decoded
	}

	return AttendanceRecordQuery{
		SessionID:  sessionID,
		StudentID:  studentID,
		PageSize:   pageSize,
		FetchLimit: pageSize + 1,
		Cursor:     cursor,
	}, nil
}

func ScopeListAttendanceRecords(
	principal PrincipalContext,
	session AttendanceSession,
	query AttendanceRecordQuery,
) (AttendanceRecordQuery, error) {
	if err := ValidatePrincipalContext(principal); err != nil {
		return AttendanceRecordQuery{}, err
	}
	if err := requireScope(principal, ScopeTeachingRead); err != nil {
		return AttendanceRecordQuery{}, err
	}
	if query.SessionID != session.ID {
		return AttendanceRecordQuery{}, validationError("sessionId does not match attendance session")
	}

	scoped := query
	if canReadOwnStudentArchive(principal, query.StudentID) ||
		(query.StudentID == "" && hasScope(principal, ScopeStudentOwnRead) && principal.StudentAccess.Mode == StudentAccessOwn) {
		scoped.StudentID = primaryOwnStudentID(principal)
		scoped.StudentIDs = nil
		return scoped, nil
	}

	if canReadAssignedStudentArchive(principal, query.StudentID) {
		if query.StudentID == "" && principal.StudentAccess.Mode == StudentAccessAssigned {
			studentIDs := normalizedStudentIDs(principal.StudentAccess.StudentIDs)
			if len(studentIDs) > 0 {
				scoped.StudentIDs = studentIDs
			}
		}
		return scoped, nil
	}
	return AttendanceRecordQuery{}, ErrForbidden
}

func BuildAttendanceRecordPage(rows []AttendanceRecord, pageSize int) (AttendanceRecordPage, error) {
	if pageSize < 1 || pageSize > maxArchivePageSize {
		return AttendanceRecordPage{}, validationError("pageSize must be between 1 and 100")
	}

	hasMore := len(rows) > pageSize
	items := rows
	if hasMore {
		items = rows[:pageSize]
	}

	nextCursor := ""
	if hasMore {
		cursor, err := EncodeAttendanceRecordCursor(items[len(items)-1])
		if err != nil {
			return AttendanceRecordPage{}, err
		}
		nextCursor = cursor
	}

	return AttendanceRecordPage{
		Items: append([]AttendanceRecord(nil), items...),
		PageInfo: ArchivePageInfo{
			PageSize:   pageSize,
			HasMore:    hasMore,
			NextCursor: nextCursor,
		},
	}, nil
}

func EncodeAttendanceRecordCursor(record AttendanceRecord) (string, error) {
	if record.ID == "" || record.CreatedAt.IsZero() {
		return "", validationError("attendance record cursor source item is invalid")
	}
	payload := attendanceRecordCursorPayload{
		CreatedAt: record.CreatedAt.UTC().Format(time.RFC3339Nano),
		ID:        record.ID,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func DecodeAttendanceRecordCursor(value string) (AttendanceRecordCursor, error) {
	data, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(value))
	if err != nil {
		return AttendanceRecordCursor{}, validationError("cursor is invalid")
	}
	var payload attendanceRecordCursorPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return AttendanceRecordCursor{}, validationError("cursor is invalid")
	}
	createdAt, err := time.Parse(time.RFC3339Nano, payload.CreatedAt)
	if err != nil || payload.ID == "" {
		return AttendanceRecordCursor{}, validationError("cursor is invalid")
	}
	return AttendanceRecordCursor{CreatedAt: createdAt.UTC(), ID: payload.ID}, nil
}

func NormalizeAttendanceSessionID(value string) (string, error) {
	id, err := normalizeRequiredText(value, maxArchiveContentRefLength, "sessionId")
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(id, "att_sess_") {
		return "", validationError("sessionId must use att_sess_ prefix")
	}
	return id, nil
}
