package domain

import "strings"

type ListStudentAttendanceRecordsInput struct {
	Principal PrincipalContext
	StudentID string
	PageSize  int
	Cursor    string
}

type StudentAttendanceRecordQuery struct {
	StudentID  string
	PageSize   int
	FetchLimit int
	Cursor     *AttendanceRecordCursor
}

func NormalizeListStudentAttendanceRecordsInput(
	input ListStudentAttendanceRecordsInput,
) (StudentAttendanceRecordQuery, error) {
	studentID, err := normalizeRequiredText(input.StudentID, maxArchiveStudentIDLength, "studentId")
	if err != nil {
		return StudentAttendanceRecordQuery{}, err
	}

	pageSize := input.PageSize
	if pageSize == 0 {
		pageSize = defaultArchivePageSize
	}
	if pageSize < 1 || pageSize > maxArchivePageSize {
		return StudentAttendanceRecordQuery{}, validationError("pageSize must be between 1 and 100")
	}

	var cursor *AttendanceRecordCursor
	if strings.TrimSpace(input.Cursor) != "" {
		decoded, err := DecodeAttendanceRecordCursor(input.Cursor)
		if err != nil {
			return StudentAttendanceRecordQuery{}, err
		}
		cursor = &decoded
	}

	return StudentAttendanceRecordQuery{
		StudentID:  studentID,
		PageSize:   pageSize,
		FetchLimit: pageSize + 1,
		Cursor:     cursor,
	}, nil
}

func ScopeListStudentAttendanceRecords(
	principal PrincipalContext,
	query StudentAttendanceRecordQuery,
) (StudentAttendanceRecordQuery, error) {
	if err := ValidatePrincipalContext(principal); err != nil {
		return StudentAttendanceRecordQuery{}, err
	}
	if canReadOwnStudentArchive(principal, query.StudentID) {
		return query, nil
	}
	if hasScope(principal, ScopeTeachingRead) && canReadAssignedStudentArchive(principal, query.StudentID) {
		return query, nil
	}
	return StudentAttendanceRecordQuery{}, ErrForbidden
}

func BuildStudentAttendanceRecordPage(rows []AttendanceRecord, pageSize int) (AttendanceRecordPage, error) {
	return BuildAttendanceRecordPage(rows, pageSize)
}
