package domain

type ListStudentAppAITutorRequestsInput struct {
	Principal PrincipalContext
	Status    TutoringAnalysisStatus
	PageSize  int
	Cursor    string
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
