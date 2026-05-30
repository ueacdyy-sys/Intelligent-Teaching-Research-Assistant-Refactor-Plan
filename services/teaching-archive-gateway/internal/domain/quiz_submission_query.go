package domain

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"
	"unicode/utf8"
)

type ListQuizSubmissionsInput struct {
	Principal         PrincipalContext
	QuizArchiveItemID string
	StudentID         string
	PageSize          int
	Cursor            string
}

type QuizSubmissionCursor struct {
	SubmittedAt time.Time
	ID          string
}

type QuizSubmissionQuery struct {
	QuizArchiveItemID string
	StudentID         string
	StudentIDs        []string
	PageSize          int
	FetchLimit        int
	Cursor            *QuizSubmissionCursor
}

type QuizSubmissionPage struct {
	Items    []QuizSubmission
	PageInfo ArchivePageInfo
}

type quizSubmissionCursorPayload struct {
	SubmittedAt string `json:"submittedAt"`
	ID          string `json:"id"`
}

func NormalizeListQuizSubmissionsInput(input ListQuizSubmissionsInput) (QuizSubmissionQuery, error) {
	quizArchiveItemID, err := NormalizeArchiveItemID(input.QuizArchiveItemID)
	if err != nil {
		return QuizSubmissionQuery{}, err
	}

	studentID := strings.TrimSpace(input.StudentID)
	if utf8.RuneCountInString(studentID) > maxArchiveStudentIDLength {
		return QuizSubmissionQuery{}, validationError("studentId is too long")
	}

	pageSize := input.PageSize
	if pageSize == 0 {
		pageSize = defaultArchivePageSize
	}
	if pageSize < 1 || pageSize > maxArchivePageSize {
		return QuizSubmissionQuery{}, validationError("pageSize must be between 1 and 100")
	}

	var cursor *QuizSubmissionCursor
	if strings.TrimSpace(input.Cursor) != "" {
		decoded, err := DecodeQuizSubmissionCursor(input.Cursor)
		if err != nil {
			return QuizSubmissionQuery{}, err
		}
		cursor = &decoded
	}

	return QuizSubmissionQuery{
		QuizArchiveItemID: quizArchiveItemID,
		StudentID:         studentID,
		PageSize:          pageSize,
		FetchLimit:        pageSize + 1,
		Cursor:            cursor,
	}, nil
}

func ScopeListQuizSubmissions(
	principal PrincipalContext,
	item ArchiveItem,
	query QuizSubmissionQuery,
) (QuizSubmissionQuery, error) {
	if err := ValidatePrincipalContext(principal); err != nil {
		return QuizSubmissionQuery{}, err
	}
	if err := ValidateQuizSubmissionArchiveItem(item); err != nil {
		return QuizSubmissionQuery{}, err
	}
	if err := AuthorizeReadArchiveItem(principal, item); err != nil {
		return QuizSubmissionQuery{}, err
	}
	if query.QuizArchiveItemID != item.ID {
		return QuizSubmissionQuery{}, validationError("quizArchiveItemId does not match archive item")
	}

	archiveQuery, err := scopeStudentArchiveQuery(principal, ArchiveItemQuery{
		OwnerType:  OwnerTypeStudent,
		StudentID:  query.StudentID,
		StudentIDs: query.StudentIDs,
		PageSize:   query.PageSize,
	})
	if err != nil {
		return QuizSubmissionQuery{}, err
	}

	scoped := query
	scoped.StudentID = archiveQuery.StudentID
	scoped.StudentIDs = archiveQuery.StudentIDs
	return scoped, nil
}

func BuildQuizSubmissionPage(rows []QuizSubmission, pageSize int) (QuizSubmissionPage, error) {
	if pageSize < 1 || pageSize > maxArchivePageSize {
		return QuizSubmissionPage{}, validationError("pageSize must be between 1 and 100")
	}

	hasMore := len(rows) > pageSize
	items := rows
	if hasMore {
		items = rows[:pageSize]
	}

	nextCursor := ""
	if hasMore {
		cursor, err := EncodeQuizSubmissionCursor(items[len(items)-1])
		if err != nil {
			return QuizSubmissionPage{}, err
		}
		nextCursor = cursor
	}

	return QuizSubmissionPage{
		Items: append([]QuizSubmission(nil), items...),
		PageInfo: ArchivePageInfo{
			PageSize:   pageSize,
			HasMore:    hasMore,
			NextCursor: nextCursor,
		},
	}, nil
}

func EncodeQuizSubmissionCursor(submission QuizSubmission) (string, error) {
	if submission.ID == "" || submission.SubmittedAt.IsZero() {
		return "", validationError("quiz submission cursor source item is invalid")
	}
	payload := quizSubmissionCursorPayload{
		SubmittedAt: submission.SubmittedAt.UTC().Format(time.RFC3339Nano),
		ID:          submission.ID,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func DecodeQuizSubmissionCursor(value string) (QuizSubmissionCursor, error) {
	data, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(value))
	if err != nil {
		return QuizSubmissionCursor{}, validationError("cursor is invalid")
	}
	var payload quizSubmissionCursorPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return QuizSubmissionCursor{}, validationError("cursor is invalid")
	}
	submittedAt, err := time.Parse(time.RFC3339Nano, payload.SubmittedAt)
	if err != nil || payload.ID == "" {
		return QuizSubmissionCursor{}, validationError("cursor is invalid")
	}
	return QuizSubmissionCursor{SubmittedAt: submittedAt.UTC(), ID: payload.ID}, nil
}
