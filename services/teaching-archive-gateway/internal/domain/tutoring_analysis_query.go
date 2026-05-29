package domain

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"
	"unicode/utf8"
)

type ListTutoringAnalysisRequestsInput struct {
	Principal              PrincipalContext
	Status                 TutoringAnalysisStatus
	ArchiveItemID          string
	SourceArchiveOwnerType OwnerType
	StudentID              string
	PageSize               int
	Cursor                 string
}

type TutoringAnalysisRequestCursor struct {
	CreatedAt time.Time
	ID        string
}

type TutoringAnalysisRequestQuery struct {
	Status                 TutoringAnalysisStatus
	ArchiveItemID          string
	SourceArchiveOwnerType OwnerType
	StudentID              string
	StudentIDs             []string
	RequestedByPrincipalID string
	PageSize               int
	FetchLimit             int
	Cursor                 *TutoringAnalysisRequestCursor
}

type TutoringAnalysisRequestPage struct {
	Items    []TutoringAnalysisRequest
	PageInfo ArchivePageInfo
}

type tutoringAnalysisRequestCursorPayload struct {
	CreatedAt string `json:"createdAt"`
	ID        string `json:"id"`
}

func NormalizeListTutoringAnalysisRequestsInput(
	input ListTutoringAnalysisRequestsInput,
) (TutoringAnalysisRequestQuery, error) {
	status := input.Status
	if status != "" && !validTutoringAnalysisStatus(status) {
		return TutoringAnalysisRequestQuery{}, validationError("status is unsupported")
	}

	archiveItemID := strings.TrimSpace(input.ArchiveItemID)
	if archiveItemID != "" {
		var err error
		archiveItemID, err = NormalizeArchiveItemID(archiveItemID)
		if err != nil {
			return TutoringAnalysisRequestQuery{}, err
		}
	}

	ownerType := input.SourceArchiveOwnerType
	if ownerType != "" && !validOwnerType(ownerType) {
		return TutoringAnalysisRequestQuery{}, validationError("sourceArchiveOwnerType is unsupported")
	}

	studentID := strings.TrimSpace(input.StudentID)
	if utf8.RuneCountInString(studentID) > maxArchiveStudentIDLength {
		return TutoringAnalysisRequestQuery{}, validationError("studentId is too long")
	}
	if ownerType == OwnerTypeTeaching && studentID != "" {
		return TutoringAnalysisRequestQuery{}, validationError("studentId cannot filter teaching-owned tutoring requests")
	}

	pageSize := input.PageSize
	if pageSize == 0 {
		pageSize = defaultArchivePageSize
	}
	if pageSize < 1 || pageSize > maxArchivePageSize {
		return TutoringAnalysisRequestQuery{}, validationError("pageSize must be between 1 and 100")
	}

	var cursor *TutoringAnalysisRequestCursor
	if strings.TrimSpace(input.Cursor) != "" {
		decoded, err := DecodeTutoringAnalysisRequestCursor(input.Cursor)
		if err != nil {
			return TutoringAnalysisRequestQuery{}, err
		}
		cursor = &decoded
	}

	return TutoringAnalysisRequestQuery{
		Status:                 status,
		ArchiveItemID:          archiveItemID,
		SourceArchiveOwnerType: ownerType,
		StudentID:              studentID,
		PageSize:               pageSize,
		FetchLimit:             pageSize + 1,
		Cursor:                 cursor,
	}, nil
}

func ScopeListTutoringAnalysisRequests(
	principal PrincipalContext,
	query TutoringAnalysisRequestQuery,
) (TutoringAnalysisRequestQuery, error) {
	if err := ValidatePrincipalContext(principal); err != nil {
		return TutoringAnalysisRequestQuery{}, err
	}

	if query.SourceArchiveOwnerType == OwnerTypeTeaching {
		if !canListTeachingTutoringAnalysisRequests(principal) {
			return TutoringAnalysisRequestQuery{}, ErrForbidden
		}
		return query, nil
	}

	if query.SourceArchiveOwnerType == OwnerTypeStudent || query.StudentID != "" {
		return scopeStudentTutoringAnalysisRequestQuery(principal, query)
	}

	if hasScope(principal, ScopeStudentOwnRead) && principal.StudentAccess.Mode == StudentAccessOwn {
		return scopeStudentTutoringAnalysisRequestQuery(principal, query)
	}

	if hasScope(principal, ScopeStudentAssignedRead) {
		return scopeStudentTutoringAnalysisRequestQuery(principal, query)
	}

	if canListTeachingTutoringAnalysisRequests(principal) {
		scoped := query
		scoped.SourceArchiveOwnerType = OwnerTypeTeaching
		return scoped, nil
	}

	return TutoringAnalysisRequestQuery{}, ErrForbidden
}

func BuildTutoringAnalysisRequestPage(
	rows []TutoringAnalysisRequest,
	pageSize int,
) (TutoringAnalysisRequestPage, error) {
	if pageSize < 1 || pageSize > maxArchivePageSize {
		return TutoringAnalysisRequestPage{}, validationError("pageSize must be between 1 and 100")
	}

	hasMore := len(rows) > pageSize
	items := rows
	if hasMore {
		items = rows[:pageSize]
	}

	nextCursor := ""
	if hasMore {
		cursor, err := EncodeTutoringAnalysisRequestCursor(items[len(items)-1])
		if err != nil {
			return TutoringAnalysisRequestPage{}, err
		}
		nextCursor = cursor
	}

	return TutoringAnalysisRequestPage{
		Items: append([]TutoringAnalysisRequest(nil), items...),
		PageInfo: ArchivePageInfo{
			PageSize:   pageSize,
			HasMore:    hasMore,
			NextCursor: nextCursor,
		},
	}, nil
}

func EncodeTutoringAnalysisRequestCursor(request TutoringAnalysisRequest) (string, error) {
	if request.ID == "" || request.CreatedAt.IsZero() {
		return "", validationError("tutoring analysis request cursor source item is invalid")
	}
	payload := tutoringAnalysisRequestCursorPayload{
		CreatedAt: request.CreatedAt.UTC().Format(time.RFC3339Nano),
		ID:        request.ID,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func DecodeTutoringAnalysisRequestCursor(value string) (TutoringAnalysisRequestCursor, error) {
	data, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(value))
	if err != nil {
		return TutoringAnalysisRequestCursor{}, validationError("cursor is invalid")
	}
	var payload tutoringAnalysisRequestCursorPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return TutoringAnalysisRequestCursor{}, validationError("cursor is invalid")
	}
	createdAt, err := time.Parse(time.RFC3339Nano, payload.CreatedAt)
	if err != nil || payload.ID == "" {
		return TutoringAnalysisRequestCursor{}, validationError("cursor is invalid")
	}
	return TutoringAnalysisRequestCursor{CreatedAt: createdAt.UTC(), ID: payload.ID}, nil
}

func validTutoringAnalysisStatus(value TutoringAnalysisStatus) bool {
	return value == TutoringAnalysisStatusQueued ||
		value == TutoringAnalysisStatusSucceeded ||
		value == TutoringAnalysisStatusFailed
}

func canListTeachingTutoringAnalysisRequests(principal PrincipalContext) bool {
	if !hasScope(principal, ScopeTeachingRead) {
		return false
	}
	return principal.Role == RoleTeacher || principal.Role == RoleAdmin || principal.Role == RoleService
}

func scopeStudentTutoringAnalysisRequestQuery(
	principal PrincipalContext,
	query TutoringAnalysisRequestQuery,
) (TutoringAnalysisRequestQuery, error) {
	archiveQuery, err := scopeStudentArchiveQuery(principal, ArchiveItemQuery{
		OwnerType:  OwnerTypeStudent,
		StudentID:  query.StudentID,
		StudentIDs: query.StudentIDs,
		PageSize:   query.PageSize,
	})
	if err != nil {
		return TutoringAnalysisRequestQuery{}, err
	}

	scoped := query
	scoped.SourceArchiveOwnerType = OwnerTypeStudent
	scoped.StudentID = archiveQuery.StudentID
	scoped.StudentIDs = archiveQuery.StudentIDs
	return scoped, nil
}
