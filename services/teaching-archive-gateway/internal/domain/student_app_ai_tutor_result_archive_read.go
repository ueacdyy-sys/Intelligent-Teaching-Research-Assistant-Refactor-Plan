package domain

import (
	"strings"
	"time"
)

const (
	maxAITutorResultArchiveGuidanceSections  = 8
	maxAITutorResultArchiveSectionID         = 128
	maxAITutorResultArchiveSectionSourceRefs = 8
	maxAITutorResultArchiveHashLength        = 128
	maxAITutorResultArchiveSafetyLabels      = 8
)

type StudentAppAITutorResultArchiveStatus string

const (
	StudentAppAITutorResultArchiveStatusReady StudentAppAITutorResultArchiveStatus = "READY_FOR_STUDENT_APP_READ"
)

type StudentAppAITutorResultArchiveSnapshot struct {
	ArchiveItemID        string
	StudentID            string
	Summary              string
	GuidanceSections     []StudentAppAITutorResultArchiveGuidanceSection
	GuidanceSectionsHash string
	SafetyLabels         []string
	SafeGuidanceOnly     bool
}

type StudentAppAITutorResultArchiveGuidanceSection struct {
	SectionID       string
	Title           string
	Text            string
	SourceBlockRefs []string
}

type StudentAppAITutorResultArchiveCard struct {
	ArchiveItemID        string
	Status               StudentAppAITutorResultArchiveStatus
	MaterialType         MaterialType
	Title                string
	Source               Source
	Tags                 []string
	AnalysisIntents      []AnalysisIntent
	OCRStatus            OCRStatus
	Summary              string
	GuidanceSections     []StudentAppAITutorResultArchiveGuidanceSection
	GuidanceSectionsHash string
	SafetyLabels         []string
	CreatedAt            time.Time
}

func NormalizeStudentAppAITutorResultArchiveSnapshot(
	snapshot StudentAppAITutorResultArchiveSnapshot,
) (StudentAppAITutorResultArchiveSnapshot, error) {
	archiveItemID, err := normalizeStudentAppArchiveItemID(snapshot.ArchiveItemID)
	if err != nil {
		return StudentAppAITutorResultArchiveSnapshot{}, err
	}
	studentID, err := normalizeRequiredText(snapshot.StudentID, maxArchiveStudentIDLength, "studentId")
	if err != nil {
		return StudentAppAITutorResultArchiveSnapshot{}, err
	}
	summary, err := normalizeSafePreviewText(snapshot.Summary, maxArchiveMaterialContentPreviewSectionText, "summary")
	if err != nil {
		return StudentAppAITutorResultArchiveSnapshot{}, err
	}
	sections, err := normalizeAITutorResultArchiveGuidanceSections(snapshot.GuidanceSections)
	if err != nil {
		return StudentAppAITutorResultArchiveSnapshot{}, err
	}
	hash, err := normalizeRequiredText(snapshot.GuidanceSectionsHash, maxAITutorResultArchiveHashLength, "guidanceSectionsHash")
	if err != nil {
		return StudentAppAITutorResultArchiveSnapshot{}, err
	}
	labels, err := normalizeAITutorResultArchiveSafetyLabels(snapshot.SafetyLabels)
	if err != nil {
		return StudentAppAITutorResultArchiveSnapshot{}, err
	}
	if !snapshot.SafeGuidanceOnly {
		return StudentAppAITutorResultArchiveSnapshot{}, ErrForbidden
	}
	return StudentAppAITutorResultArchiveSnapshot{
		ArchiveItemID:        archiveItemID,
		StudentID:            studentID,
		Summary:              summary,
		GuidanceSections:     sections,
		GuidanceSectionsHash: hash,
		SafetyLabels:         labels,
		SafeGuidanceOnly:     true,
	}, nil
}

func ValidateStudentAppAITutorResultArchiveItem(
	input NormalizedReadStudentAppArchiveItemInput,
	item ArchiveItem,
) error {
	if item.ID != input.ArchiveItemID ||
		item.OwnerType != OwnerTypeStudent ||
		item.StudentID != input.StudentID ||
		item.MaterialType != MaterialTypeHomework ||
		item.Source != SourceSystemImport ||
		item.OCRStatus != OCRStatusNotRequired ||
		!hasAllTags(item.Tags, "student_app_ai_tutor", "result", "safe_guidance", "archive_commit") ||
		!hasAnalysisIntent(item.AnalysisIntents, AnalysisIntentTutoring) ||
		!hasAnalysisIntent(item.AnalysisIntents, AnalysisIntentArchiveOnly) {
		return ErrForbidden
	}
	if _, err := normalizeStudentAppArchiveItemID(item.ID); err != nil {
		return err
	}
	const contentRefPrefix = "student-ai-tutor-result-archive:"
	if !strings.HasPrefix(item.ContentRef, contentRefPrefix) || len(item.ContentRef) == len(contentRefPrefix) {
		return ErrForbidden
	}
	return nil
}

func BuildStudentAppAITutorResultArchiveCard(
	input NormalizedReadStudentAppArchiveItemInput,
	item ArchiveItem,
	snapshot StudentAppAITutorResultArchiveSnapshot,
) (StudentAppAITutorResultArchiveCard, error) {
	if err := ValidateStudentAppAITutorResultArchiveItem(input, item); err != nil {
		return StudentAppAITutorResultArchiveCard{}, err
	}
	normalized, err := NormalizeStudentAppAITutorResultArchiveSnapshot(snapshot)
	if err != nil {
		return StudentAppAITutorResultArchiveCard{}, err
	}
	if normalized.ArchiveItemID != item.ID || normalized.StudentID != input.StudentID {
		return StudentAppAITutorResultArchiveCard{}, ErrForbidden
	}
	return StudentAppAITutorResultArchiveCard{
		ArchiveItemID:        item.ID,
		Status:               StudentAppAITutorResultArchiveStatusReady,
		MaterialType:         item.MaterialType,
		Title:                item.Title,
		Source:               item.Source,
		Tags:                 item.Tags,
		AnalysisIntents:      item.AnalysisIntents,
		OCRStatus:            item.OCRStatus,
		Summary:              normalized.Summary,
		GuidanceSections:     normalized.GuidanceSections,
		GuidanceSectionsHash: normalized.GuidanceSectionsHash,
		SafetyLabels:         normalized.SafetyLabels,
		CreatedAt:            item.CreatedAt,
	}, nil
}

func normalizeAITutorResultArchiveGuidanceSections(
	sections []StudentAppAITutorResultArchiveGuidanceSection,
) ([]StudentAppAITutorResultArchiveGuidanceSection, error) {
	if len(sections) == 0 || len(sections) > maxAITutorResultArchiveGuidanceSections {
		return nil, validationError("guidance sections length is invalid")
	}
	normalized := make([]StudentAppAITutorResultArchiveGuidanceSection, 0, len(sections))
	seen := map[string]struct{}{}
	for _, section := range sections {
		item, err := normalizeAITutorResultArchiveGuidanceSection(section)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[item.SectionID]; ok {
			return nil, validationError("guidance section id is duplicated")
		}
		seen[item.SectionID] = struct{}{}
		normalized = append(normalized, item)
	}
	return normalized, nil
}

func normalizeAITutorResultArchiveGuidanceSection(
	section StudentAppAITutorResultArchiveGuidanceSection,
) (StudentAppAITutorResultArchiveGuidanceSection, error) {
	id, err := normalizeRequiredText(section.SectionID, maxAITutorResultArchiveSectionID, "sectionId")
	if err != nil {
		return StudentAppAITutorResultArchiveGuidanceSection{}, err
	}
	title, err := normalizeSafePreviewText(section.Title, maxArchiveTitleLength, "sectionTitle")
	if err != nil {
		return StudentAppAITutorResultArchiveGuidanceSection{}, err
	}
	text, err := normalizeSafePreviewText(section.Text, maxArchiveMaterialContentPreviewSectionText, "sectionText")
	if err != nil {
		return StudentAppAITutorResultArchiveGuidanceSection{}, err
	}
	refs, err := normalizeAITutorResultArchiveSourceRefs(section.SourceBlockRefs)
	if err != nil {
		return StudentAppAITutorResultArchiveGuidanceSection{}, err
	}
	return StudentAppAITutorResultArchiveGuidanceSection{SectionID: id, Title: title, Text: text, SourceBlockRefs: refs}, nil
}

func normalizeAITutorResultArchiveSourceRefs(values []string) ([]string, error) {
	if len(values) == 0 || len(values) > maxAITutorResultArchiveSectionSourceRefs {
		return nil, validationError("source block refs length is invalid")
	}
	return normalizeUniqueRequiredTexts(values, 128, "sourceBlockRef")
}

func normalizeAITutorResultArchiveSafetyLabels(values []string) ([]string, error) {
	if len(values) == 0 || len(values) > maxAITutorResultArchiveSafetyLabels {
		return nil, validationError("safety labels length is invalid")
	}
	return normalizeUniqueRequiredTexts(values, 64, "safetyLabel")
}

func normalizeUniqueRequiredTexts(values []string, maxLength int, field string) ([]string, error) {
	normalized := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		text, err := normalizeRequiredText(value, maxLength, field)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[text]; ok {
			return nil, validationError(field + " is duplicated")
		}
		seen[text] = struct{}{}
		normalized = append(normalized, text)
	}
	return normalized, nil
}

func hasAllTags(tags []string, required ...string) bool {
	for _, expected := range required {
		found := false
		for _, tag := range tags {
			if tag == expected {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

func hasAnalysisIntent(intents []AnalysisIntent, expected AnalysisIntent) bool {
	for _, intent := range intents {
		if intent == expected {
			return true
		}
	}
	return false
}
