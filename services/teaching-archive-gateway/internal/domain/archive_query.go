package domain

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	defaultArchivePageSize = 50
	maxArchivePageSize     = 100
	maxArchiveSearchLength = 120
)

type ListArchiveItemsInput struct {
	Principal    PrincipalContext
	OwnerType    OwnerType
	StudentID    string
	MaterialType MaterialType
	PageSize     int
	Cursor       string
}

type ArchiveCursor struct {
	CreatedAt time.Time
	ID        string
}

type ArchiveItemQuery struct {
	OwnerType    OwnerType
	StudentID    string
	StudentIDs   []string
	MaterialType MaterialType
	SearchText   string
	PageSize     int
	FetchLimit   int
	Cursor       *ArchiveCursor
}

type ArchiveItemPage struct {
	Items    []ArchiveItem
	PageInfo ArchivePageInfo
}

type ArchivePageInfo struct {
	PageSize   int
	HasMore    bool
	NextCursor string
}

type archiveCursorPayload struct {
	CreatedAt string `json:"createdAt"`
	ID        string `json:"id"`
}

func NormalizeListArchiveItemsInput(input ListArchiveItemsInput) (ArchiveItemQuery, error) {
	ownerType := input.OwnerType
	if ownerType != "" && !validOwnerType(ownerType) {
		return ArchiveItemQuery{}, validationError("ownerType is unsupported")
	}
	materialType := input.MaterialType
	if materialType != "" && !validMaterialType(materialType) {
		return ArchiveItemQuery{}, validationError("materialType is unsupported")
	}

	studentID := strings.TrimSpace(input.StudentID)
	if utf8.RuneCountInString(studentID) > maxArchiveStudentIDLength {
		return ArchiveItemQuery{}, validationError("studentId is too long")
	}
	if ownerType == OwnerTypeTeaching && studentID != "" {
		return ArchiveItemQuery{}, validationError("studentId cannot filter teaching-owned archive items")
	}
	pageSize := input.PageSize
	if pageSize == 0 {
		pageSize = defaultArchivePageSize
	}
	if pageSize < 1 || pageSize > maxArchivePageSize {
		return ArchiveItemQuery{}, validationError("pageSize must be between 1 and 100")
	}

	var cursor *ArchiveCursor
	if strings.TrimSpace(input.Cursor) != "" {
		decoded, err := DecodeArchiveCursor(input.Cursor)
		if err != nil {
			return ArchiveItemQuery{}, err
		}
		cursor = &decoded
	}

	return ArchiveItemQuery{
		OwnerType:    ownerType,
		StudentID:    studentID,
		MaterialType: materialType,
		PageSize:     pageSize,
		FetchLimit:   pageSize + 1,
		Cursor:       cursor,
	}, nil
}

func normalizeArchiveSearchText(value string) (string, error) {
	text := strings.TrimSpace(value)
	if text == "" {
		return "", nil
	}
	if utf8.RuneCountInString(text) > maxArchiveSearchLength {
		return "", validationError("query is too long")
	}
	if strings.IndexFunc(text, unicode.IsControl) >= 0 {
		return "", validationError("query contains unsupported characters")
	}
	return strings.Join(strings.Fields(text), " "), nil
}

func BuildArchiveItemPage(rows []ArchiveItem, pageSize int) (ArchiveItemPage, error) {
	if pageSize < 1 || pageSize > maxArchivePageSize {
		return ArchiveItemPage{}, validationError("pageSize must be between 1 and 100")
	}

	hasMore := len(rows) > pageSize
	items := rows
	if hasMore {
		items = rows[:pageSize]
	}

	nextCursor := ""
	if hasMore {
		cursor, err := EncodeArchiveCursor(items[len(items)-1])
		if err != nil {
			return ArchiveItemPage{}, err
		}
		nextCursor = cursor
	}

	return ArchiveItemPage{
		Items: append([]ArchiveItem(nil), items...),
		PageInfo: ArchivePageInfo{
			PageSize:   pageSize,
			HasMore:    hasMore,
			NextCursor: nextCursor,
		},
	}, nil
}

func EncodeArchiveCursor(item ArchiveItem) (string, error) {
	if item.ID == "" || item.CreatedAt.IsZero() {
		return "", validationError("archive cursor source item is invalid")
	}
	payload := archiveCursorPayload{
		CreatedAt: item.CreatedAt.UTC().Format(time.RFC3339Nano),
		ID:        item.ID,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func DecodeArchiveCursor(value string) (ArchiveCursor, error) {
	data, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(value))
	if err != nil {
		return ArchiveCursor{}, validationError("cursor is invalid")
	}
	var payload archiveCursorPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return ArchiveCursor{}, validationError("cursor is invalid")
	}
	createdAt, err := time.Parse(time.RFC3339Nano, payload.CreatedAt)
	if err != nil || payload.ID == "" {
		return ArchiveCursor{}, validationError("cursor is invalid")
	}
	return ArchiveCursor{CreatedAt: createdAt.UTC(), ID: payload.ID}, nil
}
