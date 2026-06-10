package domain

type ListStudentAppAITutorRequestsInput struct {
	Principal PrincipalContext
	Status    TutoringAnalysisStatus
	PageSize  int
	Cursor    string
}

type ReadStudentAppAITutorRequestProgressInput struct {
	Principal PrincipalContext
	RequestID string
}

func NormalizeListStudentAppAITutorRequestsInput(
	input ListStudentAppAITutorRequestsInput,
) (TutoringAnalysisRequestQuery, error) {
	if err := AuthorizeListStudentAppAITutorRequests(input.Principal); err != nil {
		return TutoringAnalysisRequestQuery{}, err
	}
	return NormalizeListTutoringAnalysisRequestsInput(ListTutoringAnalysisRequestsInput{
		Principal:              input.Principal,
		Status:                 input.Status,
		SourceArchiveOwnerType: OwnerTypeStudent,
		StudentID:              primaryOwnStudentID(input.Principal),
		PageSize:               input.PageSize,
		Cursor:                 input.Cursor,
	})
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
