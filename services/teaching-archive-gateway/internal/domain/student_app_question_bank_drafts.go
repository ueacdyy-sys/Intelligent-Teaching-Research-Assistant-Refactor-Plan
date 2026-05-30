package domain

import "time"

type ListStudentAppQuestionBankDraftsInput struct {
	Principal PrincipalContext
	PageSize  int
	Cursor    string
}

type StudentAppQuestionBankDraft struct {
	TutoringAnalysisRequestID string
	ArchiveItemID             string
	SourceArchiveMaterial     MaterialType
	ResultSummary             string
	ResultRef                 string
	QuestionBankDraftRef      string
	CreatedAt                 time.Time
	CompletedAt               time.Time
}

type StudentAppQuestionBankDraftPage struct {
	Items    []StudentAppQuestionBankDraft
	PageInfo ArchivePageInfo
}

func NormalizeListStudentAppQuestionBankDraftsInput(
	input ListStudentAppQuestionBankDraftsInput,
) (TutoringAnalysisRequestQuery, error) {
	if err := AuthorizeListStudentAppQuestionBankDrafts(input.Principal); err != nil {
		return TutoringAnalysisRequestQuery{}, err
	}
	query, err := NormalizeListTutoringAnalysisRequestsInput(ListTutoringAnalysisRequestsInput{
		Principal:              input.Principal,
		Status:                 TutoringAnalysisStatusSucceeded,
		SourceArchiveOwnerType: OwnerTypeStudent,
		StudentID:              primaryOwnStudentID(input.Principal),
		PageSize:               input.PageSize,
		Cursor:                 input.Cursor,
	})
	if err != nil {
		return TutoringAnalysisRequestQuery{}, err
	}
	query.RequireQuestionBankDraftRef = true
	return query, nil
}

func AuthorizeListStudentAppQuestionBankDrafts(principal PrincipalContext) error {
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

func BuildStudentAppQuestionBankDraftPage(
	rows []TutoringAnalysisRequest,
	pageSize int,
) (StudentAppQuestionBankDraftPage, error) {
	if pageSize < 1 || pageSize > maxArchivePageSize {
		return StudentAppQuestionBankDraftPage{}, validationError("pageSize must be between 1 and 100")
	}

	hasMore := len(rows) > pageSize
	requests := rows
	if hasMore {
		requests = rows[:pageSize]
	}

	items := make([]StudentAppQuestionBankDraft, 0, len(requests))
	for _, request := range requests {
		draft, err := NewStudentAppQuestionBankDraft(request)
		if err != nil {
			return StudentAppQuestionBankDraftPage{}, err
		}
		items = append(items, draft)
	}

	nextCursor := ""
	if hasMore {
		cursor, err := EncodeTutoringAnalysisRequestCursor(requests[len(requests)-1])
		if err != nil {
			return StudentAppQuestionBankDraftPage{}, err
		}
		nextCursor = cursor
	}

	return StudentAppQuestionBankDraftPage{
		Items: items,
		PageInfo: ArchivePageInfo{
			PageSize:   pageSize,
			HasMore:    hasMore,
			NextCursor: nextCursor,
		},
	}, nil
}

func NewStudentAppQuestionBankDraft(
	request TutoringAnalysisRequest,
) (StudentAppQuestionBankDraft, error) {
	if request.Status != TutoringAnalysisStatusSucceeded {
		return StudentAppQuestionBankDraft{}, validationError("question bank draft requires succeeded tutoring analysis")
	}
	if request.SourceArchiveOwnerType != OwnerTypeStudent {
		return StudentAppQuestionBankDraft{}, validationError("question bank draft requires student archive source")
	}
	if request.QuestionBankDraftRef == "" {
		return StudentAppQuestionBankDraft{}, validationError("questionBankDraftRef is required")
	}
	if request.ResultSummary == "" {
		return StudentAppQuestionBankDraft{}, validationError("resultSummary is required")
	}
	if request.ResultRef == "" {
		return StudentAppQuestionBankDraft{}, validationError("resultRef is required")
	}
	if request.CompletedAt.IsZero() {
		return StudentAppQuestionBankDraft{}, validationError("completedAt is required")
	}
	return StudentAppQuestionBankDraft{
		TutoringAnalysisRequestID: request.ID,
		ArchiveItemID:             request.ArchiveItemID,
		SourceArchiveMaterial:     request.SourceArchiveMaterial,
		ResultSummary:             request.ResultSummary,
		ResultRef:                 request.ResultRef,
		QuestionBankDraftRef:      request.QuestionBankDraftRef,
		CreatedAt:                 request.CreatedAt,
		CompletedAt:               request.CompletedAt,
	}, nil
}
