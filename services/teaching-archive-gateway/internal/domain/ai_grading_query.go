package domain

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"
	"unicode/utf8"
)

type ListAIGradingRequestsInput struct {
	Principal              PrincipalContext
	Status                 AIGradingStatus
	ArchiveItemID          string
	SourceArchiveOwnerType OwnerType
	StudentID              string
	PageSize               int
	Cursor                 string
}

type AIGradingRequestCursor struct {
	CreatedAt time.Time
	ID        string
}

type AIGradingRequestQuery struct {
	Status                 AIGradingStatus
	ArchiveItemID          string
	SourceArchiveOwnerType OwnerType
	StudentID              string
	StudentIDs             []string
	PageSize               int
	FetchLimit             int
	Cursor                 *AIGradingRequestCursor
}

type AIGradingRequestPage struct {
	Items    []AIGradingRequest
	PageInfo ArchivePageInfo
}

type aiGradingRequestCursorPayload struct {
	CreatedAt string `json:"createdAt"`
	ID        string `json:"id"`
}

func NormalizeListAIGradingRequestsInput(input ListAIGradingRequestsInput) (AIGradingRequestQuery, error) {
	status := input.Status
	if status != "" && !validAIGradingStatus(status) {
		return AIGradingRequestQuery{}, validationError("status is unsupported")
	}

	archiveItemID := strings.TrimSpace(input.ArchiveItemID)
	if archiveItemID != "" {
		var err error
		archiveItemID, err = NormalizeArchiveItemID(archiveItemID)
		if err != nil {
			return AIGradingRequestQuery{}, err
		}
	}

	ownerType := input.SourceArchiveOwnerType
	if ownerType != "" && ownerType != OwnerTypeStudent {
		return AIGradingRequestQuery{}, validationError("sourceArchiveOwnerType is unsupported for ai grading requests")
	}

	studentID := strings.TrimSpace(input.StudentID)
	if utf8.RuneCountInString(studentID) > maxArchiveStudentIDLength {
		return AIGradingRequestQuery{}, validationError("studentId is too long")
	}

	pageSize := input.PageSize
	if pageSize == 0 {
		pageSize = defaultArchivePageSize
	}
	if pageSize < 1 || pageSize > maxArchivePageSize {
		return AIGradingRequestQuery{}, validationError("pageSize must be between 1 and 100")
	}

	var cursor *AIGradingRequestCursor
	if strings.TrimSpace(input.Cursor) != "" {
		decoded, err := DecodeAIGradingRequestCursor(input.Cursor)
		if err != nil {
			return AIGradingRequestQuery{}, err
		}
		cursor = &decoded
	}

	return AIGradingRequestQuery{
		Status:                 status,
		ArchiveItemID:          archiveItemID,
		SourceArchiveOwnerType: ownerType,
		StudentID:              studentID,
		PageSize:               pageSize,
		FetchLimit:             pageSize + 1,
		Cursor:                 cursor,
	}, nil
}

func ScopeListAIGradingRequests(
	principal PrincipalContext,
	query AIGradingRequestQuery,
) (AIGradingRequestQuery, error) {
	if err := ValidatePrincipalContext(principal); err != nil {
		return AIGradingRequestQuery{}, err
	}
	return scopeStudentAIGradingRequestQuery(principal, query)
}

func BuildAIGradingRequestPage(
	rows []AIGradingRequest,
	pageSize int,
) (AIGradingRequestPage, error) {
	if pageSize < 1 || pageSize > maxArchivePageSize {
		return AIGradingRequestPage{}, validationError("pageSize must be between 1 and 100")
	}

	hasMore := len(rows) > pageSize
	items := rows
	if hasMore {
		items = rows[:pageSize]
	}

	nextCursor := ""
	if hasMore {
		cursor, err := EncodeAIGradingRequestCursor(items[len(items)-1])
		if err != nil {
			return AIGradingRequestPage{}, err
		}
		nextCursor = cursor
	}

	return AIGradingRequestPage{
		Items: append([]AIGradingRequest(nil), items...),
		PageInfo: ArchivePageInfo{
			PageSize:   pageSize,
			HasMore:    hasMore,
			NextCursor: nextCursor,
		},
	}, nil
}

func EncodeAIGradingRequestCursor(request AIGradingRequest) (string, error) {
	if request.ID == "" || request.CreatedAt.IsZero() {
		return "", validationError("ai grading request cursor source item is invalid")
	}
	payload := aiGradingRequestCursorPayload{
		CreatedAt: request.CreatedAt.UTC().Format(time.RFC3339Nano),
		ID:        request.ID,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func DecodeAIGradingRequestCursor(value string) (AIGradingRequestCursor, error) {
	data, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(value))
	if err != nil {
		return AIGradingRequestCursor{}, validationError("cursor is invalid")
	}
	var payload aiGradingRequestCursorPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return AIGradingRequestCursor{}, validationError("cursor is invalid")
	}
	createdAt, err := time.Parse(time.RFC3339Nano, payload.CreatedAt)
	if err != nil || payload.ID == "" {
		return AIGradingRequestCursor{}, validationError("cursor is invalid")
	}
	return AIGradingRequestCursor{CreatedAt: createdAt.UTC(), ID: payload.ID}, nil
}

func validAIGradingStatus(value AIGradingStatus) bool {
	return value == AIGradingStatusQueued || value == AIGradingStatusInProgress
}

func scopeStudentAIGradingRequestQuery(
	principal PrincipalContext,
	query AIGradingRequestQuery,
) (AIGradingRequestQuery, error) {
	archiveQuery, err := scopeStudentArchiveQuery(principal, ArchiveItemQuery{
		OwnerType:  OwnerTypeStudent,
		StudentID:  query.StudentID,
		StudentIDs: query.StudentIDs,
		PageSize:   query.PageSize,
	})
	if err != nil {
		return AIGradingRequestQuery{}, err
	}

	scoped := query
	scoped.SourceArchiveOwnerType = OwnerTypeStudent
	scoped.StudentID = archiveQuery.StudentID
	scoped.StudentIDs = archiveQuery.StudentIDs
	return scoped, nil
}
