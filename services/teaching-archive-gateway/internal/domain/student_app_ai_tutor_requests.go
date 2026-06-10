package domain

import "strings"

type StudentAppAITutorRequestProgressView string

const (
	StudentAppAITutorRequestProgressViewAll                   StudentAppAITutorRequestProgressView = "ALL"
	StudentAppAITutorRequestProgressViewAutoRefresh           StudentAppAITutorRequestProgressView = "AUTO_REFRESH"
	StudentAppAITutorRequestProgressViewActionReady           StudentAppAITutorRequestProgressView = "ACTION_READY"
	StudentAppAITutorRequestProgressViewTeacherReviewRequired StudentAppAITutorRequestProgressView = "TEACHER_REVIEW_REQUIRED"
	StudentAppAITutorRequestProgressViewFailed                StudentAppAITutorRequestProgressView = "FAILED"
)

type ListStudentAppAITutorRequestsInput struct {
	Principal    PrincipalContext
	Status       TutoringAnalysisStatus
	ProgressView StudentAppAITutorRequestProgressView
	PageSize     int
	Cursor       string
}

type ReadStudentAppAITutorRequestProgressInput struct {
	Principal PrincipalContext
	RequestID string
}

type ReadStudentAppAITutorRequestProgressSummaryInput struct {
	Principal PrincipalContext
}

type StudentAppAITutorRequestProgressSummary struct {
	TotalCount                 int
	AutoRefreshCount           int
	ActionReadyCount           int
	TeacherReviewRequiredCount int
	FailedCount                int
}

func NormalizeListStudentAppAITutorRequestsInput(
	input ListStudentAppAITutorRequestsInput,
) (TutoringAnalysisRequestQuery, error) {
	if err := AuthorizeListStudentAppAITutorRequests(input.Principal); err != nil {
		return TutoringAnalysisRequestQuery{}, err
	}
	progressView, err := NormalizeStudentAppAITutorRequestProgressView(input.ProgressView)
	if err != nil {
		return TutoringAnalysisRequestQuery{}, err
	}
	if input.Status != "" && progressView != "" && progressView != StudentAppAITutorRequestProgressViewAll {
		return TutoringAnalysisRequestQuery{}, validationError("status cannot be combined with progressView")
	}
	query, err := NormalizeListTutoringAnalysisRequestsInput(ListTutoringAnalysisRequestsInput{
		Principal:              input.Principal,
		Status:                 input.Status,
		SourceArchiveOwnerType: OwnerTypeStudent,
		StudentID:              primaryOwnStudentID(input.Principal),
		PageSize:               input.PageSize,
		Cursor:                 input.Cursor,
	})
	if err != nil {
		return TutoringAnalysisRequestQuery{}, err
	}
	query.Statuses = StudentAppAITutorRequestProgressViewStatuses(progressView)
	return query, nil
}

func NormalizeReadStudentAppAITutorRequestProgressInput(
	input ReadStudentAppAITutorRequestProgressInput,
) (TutoringAnalysisRequestQuery, error) {
	if err := AuthorizeListStudentAppAITutorRequests(input.Principal); err != nil {
		return TutoringAnalysisRequestQuery{}, err
	}
	requestID, err := NormalizeTutoringAnalysisRequestID(input.RequestID)
	if err != nil {
		return TutoringAnalysisRequestQuery{}, err
	}
	query, err := NormalizeListTutoringAnalysisRequestsInput(ListTutoringAnalysisRequestsInput{
		Principal:              input.Principal,
		SourceArchiveOwnerType: OwnerTypeStudent,
		StudentID:              primaryOwnStudentID(input.Principal),
		PageSize:               1,
	})
	if err != nil {
		return TutoringAnalysisRequestQuery{}, err
	}
	query.ID = requestID
	query.FetchLimit = 1
	return query, nil
}

func NormalizeReadStudentAppAITutorRequestProgressSummaryInput(
	input ReadStudentAppAITutorRequestProgressSummaryInput,
) (TutoringAnalysisRequestQuery, error) {
	if err := AuthorizeListStudentAppAITutorRequests(input.Principal); err != nil {
		return TutoringAnalysisRequestQuery{}, err
	}
	query, err := NormalizeListTutoringAnalysisRequestsInput(ListTutoringAnalysisRequestsInput{
		Principal:              input.Principal,
		SourceArchiveOwnerType: OwnerTypeStudent,
		StudentID:              primaryOwnStudentID(input.Principal),
		PageSize:               1,
	})
	if err != nil {
		return TutoringAnalysisRequestQuery{}, err
	}
	query.PageSize = 0
	query.FetchLimit = 0
	return query, nil
}

func AuthorizeListStudentAppAITutorRequests(principal PrincipalContext) error {
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

func NormalizeStudentAppAITutorRequestProgressView(
	value StudentAppAITutorRequestProgressView,
) (StudentAppAITutorRequestProgressView, error) {
	normalized := StudentAppAITutorRequestProgressView(
		strings.ToUpper(strings.TrimSpace(string(value))),
	)
	switch normalized {
	case "":
		return "", nil
	case StudentAppAITutorRequestProgressViewAll,
		StudentAppAITutorRequestProgressViewAutoRefresh,
		StudentAppAITutorRequestProgressViewActionReady,
		StudentAppAITutorRequestProgressViewTeacherReviewRequired,
		StudentAppAITutorRequestProgressViewFailed:
		return normalized, nil
	default:
		return "", validationError("progressView is unsupported")
	}
}

func BuildStudentAppAITutorRequestProgressSummary(
	statusCounts map[TutoringAnalysisStatus]int,
) (StudentAppAITutorRequestProgressSummary, error) {
	summary := StudentAppAITutorRequestProgressSummary{}
	for status, count := range statusCounts {
		if !validTutoringAnalysisStatus(status) {
			return StudentAppAITutorRequestProgressSummary{}, validationError("status is unsupported")
		}
		if count < 0 {
			return StudentAppAITutorRequestProgressSummary{}, validationError("status count must be non-negative")
		}
		summary.TotalCount += count
		switch status {
		case TutoringAnalysisStatusQueued, TutoringAnalysisStatusInProgress:
			summary.AutoRefreshCount += count
		case TutoringAnalysisStatusSucceeded:
			summary.ActionReadyCount += count
		case TutoringAnalysisStatusFailed:
			summary.TeacherReviewRequiredCount += count
			summary.FailedCount += count
		}
	}
	return summary, nil
}

func StudentAppAITutorRequestProgressViewStatuses(
	view StudentAppAITutorRequestProgressView,
) []TutoringAnalysisStatus {
	switch view {
	case StudentAppAITutorRequestProgressViewAutoRefresh:
		return []TutoringAnalysisStatus{
			TutoringAnalysisStatusQueued,
			TutoringAnalysisStatusInProgress,
		}
	case StudentAppAITutorRequestProgressViewActionReady:
		return []TutoringAnalysisStatus{TutoringAnalysisStatusSucceeded}
	case StudentAppAITutorRequestProgressViewTeacherReviewRequired,
		StudentAppAITutorRequestProgressViewFailed:
		return []TutoringAnalysisStatus{TutoringAnalysisStatusFailed}
	default:
		return nil
	}
}
