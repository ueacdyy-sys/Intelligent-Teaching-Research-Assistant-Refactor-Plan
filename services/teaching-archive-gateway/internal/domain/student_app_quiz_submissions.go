package domain

import "strings"

type ListStudentAppQuizSubmissionsInput struct {
	Principal         PrincipalContext
	QuizArchiveItemID string
	PageSize          int
	Cursor            string
}

func NormalizeListStudentAppQuizSubmissionsInput(
	input ListStudentAppQuizSubmissionsInput,
) (QuizSubmissionQuery, error) {
	if err := AuthorizeListStudentAppQuizSubmissions(input.Principal); err != nil {
		return QuizSubmissionQuery{}, err
	}

	quizArchiveItemID := strings.TrimSpace(input.QuizArchiveItemID)
	if quizArchiveItemID != "" {
		normalized, err := NormalizeArchiveItemID(quizArchiveItemID)
		if err != nil {
			return QuizSubmissionQuery{}, err
		}
		quizArchiveItemID = normalized
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
		StudentID:         primaryOwnStudentID(input.Principal),
		PageSize:          pageSize,
		FetchLimit:        pageSize + 1,
		Cursor:            cursor,
	}, nil
}

func AuthorizeListStudentAppQuizSubmissions(principal PrincipalContext) error {
	if err := ValidatePrincipalContext(principal); err != nil {
		return err
	}
	if err := requireScope(principal, ScopeStudentOwnRead); err != nil {
		return err
	}
	if principal.SubjectType != SubjectUser ||
		principal.Role != RoleStudent ||
		principal.EntryPoint != EntryPointStudentApp ||
		principal.StudentAccess.Mode != StudentAccessOwn ||
		primaryOwnStudentID(principal) == "" {
		return ErrForbidden
	}
	return nil
}
