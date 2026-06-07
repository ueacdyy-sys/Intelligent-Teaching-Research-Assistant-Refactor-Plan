package domain

import "strings"

type ListStudentAppArchiveItemsInput struct {
	Principal    PrincipalContext
	MaterialType MaterialType
	Query        string
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
	searchText, err := normalizeArchiveSearchText(input.Query)
	if err != nil {
		return ArchiveItemQuery{}, err
	}
	query, err := NormalizeListArchiveItemsInput(ListArchiveItemsInput{
		Principal:    input.Principal,
		OwnerType:    OwnerTypeStudent,
		StudentID:    primaryOwnStudentID(input.Principal),
		MaterialType: input.MaterialType,
		PageSize:     input.PageSize,
		Cursor:       input.Cursor,
	})
	if err != nil {
		return ArchiveItemQuery{}, err
	}
	query.SearchText = searchText
	return query, nil
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

type ReadStudentAppArchiveItemInput struct {
	Principal     PrincipalContext
	ArchiveItemID string
}

type NormalizedReadStudentAppArchiveItemInput struct {
	Principal     PrincipalContext
	ArchiveItemID string
	StudentID     string
}

type StudentAppArchiveItemStudyPacketStatus string

const (
	StudentAppArchiveItemStudyPacketStatusReady StudentAppArchiveItemStudyPacketStatus = "READY"
)

type StudentAppArchiveItemStudyPacket struct {
	PacketStatus   StudentAppArchiveItemStudyPacketStatus
	ArchiveItem    ArchiveItem
	ContentPreview PublishedArchiveMaterialContentPreviewRenderEnvelope
}

func NormalizeReadStudentAppArchiveItemInput(
	input ReadStudentAppArchiveItemInput,
) (NormalizedReadStudentAppArchiveItemInput, error) {
	if err := AuthorizeListStudentAppArchiveItems(input.Principal); err != nil {
		return NormalizedReadStudentAppArchiveItemInput{}, err
	}
	archiveItemID, err := normalizeStudentAppArchiveItemID(input.ArchiveItemID)
	if err != nil {
		return NormalizedReadStudentAppArchiveItemInput{}, err
	}
	studentID := primaryOwnStudentID(input.Principal)
	if studentID == "" {
		return NormalizedReadStudentAppArchiveItemInput{}, ErrForbidden
	}
	return NormalizedReadStudentAppArchiveItemInput{
		Principal:     input.Principal,
		ArchiveItemID: archiveItemID,
		StudentID:     studentID,
	}, nil
}

func BuildStudentAppArchiveItemMetadata(
	input NormalizedReadStudentAppArchiveItemInput,
	item ArchiveItem,
) (ArchiveItem, error) {
	if item.ID != input.ArchiveItemID ||
		item.OwnerType != OwnerTypeStudent ||
		item.StudentID != input.StudentID ||
		item.MaterialType == MaterialTypeTeachingMaterial ||
		!validMaterialType(item.MaterialType) {
		return ArchiveItem{}, ErrForbidden
	}
	if _, err := normalizeStudentAppArchiveItemID(item.ID); err != nil {
		return ArchiveItem{}, err
	}
	return item, nil
}

func BuildStudentAppArchiveItemStudyPacket(
	input NormalizedReadStudentAppArchiveItemInput,
	item ArchiveItem,
	preview PublishedArchiveMaterialContentPreview,
) (StudentAppArchiveItemStudyPacket, error) {
	metadata, err := BuildStudentAppArchiveItemMetadata(input, item)
	if err != nil {
		return StudentAppArchiveItemStudyPacket{}, err
	}
	rendered, err := BuildStudentAppArchiveItemContentPreviewRenderEnvelope(
		NormalizedReadStudentAppArchiveItemContentPreviewInput{
			Principal:     input.Principal,
			ArchiveItemID: input.ArchiveItemID,
			StudentID:     input.StudentID,
		},
		preview,
	)
	if err != nil {
		return StudentAppArchiveItemStudyPacket{}, err
	}
	if metadata.ID != rendered.ArchiveItemID ||
		metadata.MaterialType != rendered.MaterialType ||
		metadata.Title != rendered.Title {
		return StudentAppArchiveItemStudyPacket{}, ErrForbidden
	}
	return StudentAppArchiveItemStudyPacket{
		PacketStatus:   StudentAppArchiveItemStudyPacketStatusReady,
		ArchiveItem:    metadata,
		ContentPreview: rendered,
	}, nil
}

func normalizeStudentAppArchiveItemID(value string) (string, error) {
	archiveItemID, err := NormalizeArchiveItemID(value)
	if err != nil {
		return "", err
	}
	const prefix = "tarch_"
	if !strings.HasPrefix(archiveItemID, prefix) || len(archiveItemID) == len(prefix) {
		return "", validationError("archiveItemId must use tarch_ prefix")
	}
	for _, r := range archiveItemID[len(prefix):] {
		if (r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') ||
			r == '_' ||
			r == '-' {
			continue
		}
		return "", validationError("archiveItemId contains unsupported characters")
	}
	return archiveItemID, nil
}
