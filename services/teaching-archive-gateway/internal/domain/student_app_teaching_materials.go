package domain

type ListStudentAppTeachingMaterialsInput struct {
	Principal PrincipalContext
	PageSize  int
	Cursor    string
}

func NormalizeListStudentAppTeachingMaterialsInput(
	input ListStudentAppTeachingMaterialsInput,
) (ArchiveItemQuery, error) {
	if err := AuthorizeListStudentAppTeachingMaterials(input.Principal); err != nil {
		return ArchiveItemQuery{}, err
	}
	return NormalizeListArchiveItemsInput(ListArchiveItemsInput{
		Principal:    input.Principal,
		OwnerType:    OwnerTypeTeaching,
		MaterialType: MaterialTypeTeachingMaterial,
		PageSize:     input.PageSize,
		Cursor:       input.Cursor,
	})
}

func AuthorizeListStudentAppTeachingMaterials(principal PrincipalContext) error {
	if err := ValidatePrincipalContext(principal); err != nil {
		return err
	}
	if err := requireScope(principal, ScopeTeachingRead); err != nil {
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
