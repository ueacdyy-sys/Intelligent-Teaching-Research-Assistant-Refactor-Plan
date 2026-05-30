package domain

type ListStudentAppArchiveItemsInput struct {
	Principal    PrincipalContext
	MaterialType MaterialType
	PageSize     int
	Cursor       string
}

func NormalizeListStudentAppArchiveItemsInput(
	input ListStudentAppArchiveItemsInput,
) (ArchiveItemQuery, error) {
	if err := AuthorizeListStudentAppArchiveItems(input.Principal); err != nil {
		return ArchiveItemQuery{}, err
	}
	if input.MaterialType == MaterialTypeTeachingMaterial {
		return ArchiveItemQuery{}, validationError("materialType is not a student archive material")
	}
	return NormalizeListArchiveItemsInput(ListArchiveItemsInput{
		Principal:    input.Principal,
		OwnerType:    OwnerTypeStudent,
		StudentID:    primaryOwnStudentID(input.Principal),
		MaterialType: input.MaterialType,
		PageSize:     input.PageSize,
		Cursor:       input.Cursor,
	})
}

func AuthorizeListStudentAppArchiveItems(principal PrincipalContext) error {
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
