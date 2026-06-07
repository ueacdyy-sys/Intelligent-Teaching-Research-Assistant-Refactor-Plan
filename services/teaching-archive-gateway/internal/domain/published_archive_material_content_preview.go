package domain

import (
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	maxArchiveMaterialContentPreviewSections    = 20
	maxArchiveMaterialContentPreviewSectionID   = 128
	maxArchiveMaterialContentPreviewSectionText = 1200
	maxArchiveMaterialContentPreviewPageHint    = 80
)

type PublishedArchiveMaterialContentPreviewStatus string

const (
	PublishedArchiveMaterialContentPreviewStatusReady PublishedArchiveMaterialContentPreviewStatus = "READY"
)

type PublishedArchiveMaterialContentPreviewSource string

const (
	PublishedArchiveMaterialContentPreviewSourceSafeReviewed PublishedArchiveMaterialContentPreviewSource = "SAFE_REVIEWED_PREVIEW"
)

type ReadStudentAppArchiveItemContentPreviewInput struct {
	Principal     PrincipalContext
	ArchiveItemID string
}

type NormalizedReadStudentAppArchiveItemContentPreviewInput struct {
	Principal     PrincipalContext
	ArchiveItemID string
	StudentID     string
}

type PublishedArchiveMaterialContentPreview struct {
	ArchiveItemID string
	StudentID     string
	MaterialType  MaterialType
	Title         string
	Status        PublishedArchiveMaterialContentPreviewStatus
	PreviewSource PublishedArchiveMaterialContentPreviewSource
	Sections      []PublishedArchiveMaterialContentPreviewSection
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

type PublishedArchiveMaterialContentPreviewSection struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Text     string `json:"text"`
	PageHint string `json:"pageHint,omitempty"`
}

func NormalizeReadStudentAppArchiveItemContentPreviewInput(
	input ReadStudentAppArchiveItemContentPreviewInput,
) (NormalizedReadStudentAppArchiveItemContentPreviewInput, error) {
	metadataInput, err := NormalizeReadStudentAppArchiveItemInput(ReadStudentAppArchiveItemInput{
		Principal:     input.Principal,
		ArchiveItemID: input.ArchiveItemID,
	})
	if err != nil {
		return NormalizedReadStudentAppArchiveItemContentPreviewInput{}, err
	}
	return NormalizedReadStudentAppArchiveItemContentPreviewInput{
		Principal:     metadataInput.Principal,
		ArchiveItemID: metadataInput.ArchiveItemID,
		StudentID:     metadataInput.StudentID,
	}, nil
}

func NormalizePublishedArchiveMaterialContentPreview(
	preview PublishedArchiveMaterialContentPreview,
) (PublishedArchiveMaterialContentPreview, error) {
	archiveItemID, err := normalizeStudentAppArchiveItemID(preview.ArchiveItemID)
	if err != nil {
		return PublishedArchiveMaterialContentPreview{}, err
	}
	studentID, err := normalizeRequiredText(preview.StudentID, maxArchiveStudentIDLength, "studentId")
	if err != nil {
		return PublishedArchiveMaterialContentPreview{}, err
	}
	if preview.MaterialType == MaterialTypeTeachingMaterial || !validMaterialType(preview.MaterialType) {
		return PublishedArchiveMaterialContentPreview{}, validationError("materialType is not a student archive material")
	}
	title, err := normalizeRequiredText(preview.Title, maxArchiveTitleLength, "title")
	if err != nil {
		return PublishedArchiveMaterialContentPreview{}, err
	}
	status := preview.Status
	if status == "" {
		status = PublishedArchiveMaterialContentPreviewStatusReady
	}
	if status != PublishedArchiveMaterialContentPreviewStatusReady {
		return PublishedArchiveMaterialContentPreview{}, validationError("content preview status is unsupported")
	}
	source := preview.PreviewSource
	if source == "" {
		source = PublishedArchiveMaterialContentPreviewSourceSafeReviewed
	}
	if source != PublishedArchiveMaterialContentPreviewSourceSafeReviewed {
		return PublishedArchiveMaterialContentPreview{}, validationError("content preview source is unsupported")
	}
	sections, err := normalizeArchiveMaterialContentPreviewSections(preview.Sections)
	if err != nil {
		return PublishedArchiveMaterialContentPreview{}, err
	}
	if preview.CreatedAt.IsZero() || preview.UpdatedAt.IsZero() {
		return PublishedArchiveMaterialContentPreview{}, validationError("content preview timestamps are required")
	}
	return PublishedArchiveMaterialContentPreview{
		ArchiveItemID: archiveItemID,
		StudentID:     studentID,
		MaterialType:  preview.MaterialType,
		Title:         title,
		Status:        status,
		PreviewSource: source,
		Sections:      sections,
		CreatedAt:     preview.CreatedAt.UTC(),
		UpdatedAt:     preview.UpdatedAt.UTC(),
	}, nil
}

func BuildStudentAppArchiveItemContentPreview(
	input NormalizedReadStudentAppArchiveItemContentPreviewInput,
	preview PublishedArchiveMaterialContentPreview,
) (PublishedArchiveMaterialContentPreview, error) {
	normalized, err := NormalizePublishedArchiveMaterialContentPreview(preview)
	if err != nil {
		return PublishedArchiveMaterialContentPreview{}, err
	}
	if normalized.ArchiveItemID != input.ArchiveItemID ||
		normalized.StudentID != input.StudentID ||
		normalized.Status != PublishedArchiveMaterialContentPreviewStatusReady {
		return PublishedArchiveMaterialContentPreview{}, ErrForbidden
	}
	return normalized, nil
}

func normalizeArchiveMaterialContentPreviewSections(
	sections []PublishedArchiveMaterialContentPreviewSection,
) ([]PublishedArchiveMaterialContentPreviewSection, error) {
	if len(sections) == 0 {
		return nil, validationError("content preview requires at least one section")
	}
	if len(sections) > maxArchiveMaterialContentPreviewSections {
		return nil, validationError("too many content preview sections")
	}
	normalized := make([]PublishedArchiveMaterialContentPreviewSection, 0, len(sections))
	seen := map[string]struct{}{}
	for _, section := range sections {
		item, err := normalizeArchiveMaterialContentPreviewSection(section)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[item.ID]; ok {
			return nil, validationError("content preview section id is duplicated")
		}
		seen[item.ID] = struct{}{}
		normalized = append(normalized, item)
	}
	return normalized, nil
}

func normalizeArchiveMaterialContentPreviewSection(
	section PublishedArchiveMaterialContentPreviewSection,
) (PublishedArchiveMaterialContentPreviewSection, error) {
	id, err := normalizeRequiredText(section.ID, maxArchiveMaterialContentPreviewSectionID, "sectionId")
	if err != nil {
		return PublishedArchiveMaterialContentPreviewSection{}, err
	}
	title, err := normalizeSafePreviewText(section.Title, maxArchiveTitleLength, "sectionTitle")
	if err != nil {
		return PublishedArchiveMaterialContentPreviewSection{}, err
	}
	text, err := normalizeSafePreviewText(section.Text, maxArchiveMaterialContentPreviewSectionText, "sectionText")
	if err != nil {
		return PublishedArchiveMaterialContentPreviewSection{}, err
	}
	pageHint, err := normalizeOptionalSafePreviewText(section.PageHint, maxArchiveMaterialContentPreviewPageHint, "pageHint")
	if err != nil {
		return PublishedArchiveMaterialContentPreviewSection{}, err
	}
	return PublishedArchiveMaterialContentPreviewSection{
		ID:       id,
		Title:    title,
		Text:     text,
		PageHint: pageHint,
	}, nil
}

func normalizeSafePreviewText(value string, maxLength int, field string) (string, error) {
	text, err := normalizeRequiredText(value, maxLength, field)
	if err != nil {
		return "", err
	}
	return validateSafePreviewText(text, field)
}

func normalizeOptionalSafePreviewText(value string, maxLength int, field string) (string, error) {
	text := strings.TrimSpace(value)
	if text == "" {
		return "", nil
	}
	if utf8.RuneCountInString(text) > maxLength {
		return "", validationError(field + " is too long")
	}
	return validateSafePreviewText(text, field)
}

func validateSafePreviewText(text string, field string) (string, error) {
	lower := strings.ToLower(text)
	if strings.ContainsAny(text, "<>") ||
		strings.Contains(lower, "javascript:") ||
		strings.Contains(lower, "data:") {
		return "", validationError(field + " contains unsafe preview text")
	}
	for _, r := range text {
		if unicode.IsControl(r) {
			return "", validationError(field + " contains control characters")
		}
	}
	return text, nil
}
