package domain

import "time"

type StudentAppAITutorResultArchiveRenderFormat string

const (
	StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks StudentAppAITutorResultArchiveRenderFormat = "SAFE_TEXT_BLOCKS"
)

type StudentAppAITutorResultArchiveBlockType string

const (
	StudentAppAITutorResultArchiveBlockTypeSummary         StudentAppAITutorResultArchiveBlockType = "SUMMARY"
	StudentAppAITutorResultArchiveBlockTypeGuidanceSection StudentAppAITutorResultArchiveBlockType = "GUIDANCE_SECTION"
)

type StudentAppAITutorResultArchiveRenderEnvelope struct {
	ArchiveItemID           string
	SourceArchiveItemID     string
	SourceTutoringRequestID string
	Status                  StudentAppAITutorResultArchiveStatus
	MaterialType            MaterialType
	Title                   string
	RenderFormat            StudentAppAITutorResultArchiveRenderFormat
	Blocks                  []StudentAppAITutorResultArchiveRenderBlock
	GuidanceSectionsHash    string
	SafetyLabels            []string
	CreatedAt               time.Time
	FollowUpDepth           int
}

type StudentAppAITutorResultArchiveRenderBlock struct {
	BlockID         string
	BlockType       StudentAppAITutorResultArchiveBlockType
	SectionID       string
	Title           string
	Text            string
	SourceBlockRefs []string
}

func BuildStudentAppAITutorResultArchiveRenderEnvelope(
	card StudentAppAITutorResultArchiveCard,
) (StudentAppAITutorResultArchiveRenderEnvelope, error) {
	archiveItemID, err := normalizeStudentAppArchiveItemID(card.ArchiveItemID)
	if err != nil {
		return StudentAppAITutorResultArchiveRenderEnvelope{}, err
	}
	sourceArchiveItemID, err := NormalizeArchiveItemID(card.SourceArchiveItemID)
	if err != nil {
		return StudentAppAITutorResultArchiveRenderEnvelope{}, err
	}
	sourceTutoringRequestID, err := NormalizeTutoringAnalysisRequestID(card.SourceTutoringRequestID)
	if err != nil {
		return StudentAppAITutorResultArchiveRenderEnvelope{}, err
	}
	if card.Status != StudentAppAITutorResultArchiveStatusReady ||
		card.MaterialType != MaterialTypeHomework {
		return StudentAppAITutorResultArchiveRenderEnvelope{}, ErrForbidden
	}
	title, err := normalizeSafePreviewText(card.Title, maxArchiveTitleLength, "title")
	if err != nil {
		return StudentAppAITutorResultArchiveRenderEnvelope{}, err
	}
	summary, err := normalizeSafePreviewText(card.Summary, maxArchiveMaterialContentPreviewSectionText, "summary")
	if err != nil {
		return StudentAppAITutorResultArchiveRenderEnvelope{}, err
	}
	sections, err := normalizeAITutorResultArchiveGuidanceSections(card.GuidanceSections)
	if err != nil {
		return StudentAppAITutorResultArchiveRenderEnvelope{}, err
	}
	hash, err := normalizeRequiredText(card.GuidanceSectionsHash, maxAITutorResultArchiveHashLength, "guidanceSectionsHash")
	if err != nil {
		return StudentAppAITutorResultArchiveRenderEnvelope{}, err
	}
	labels, err := normalizeAITutorResultArchiveSafetyLabels(card.SafetyLabels)
	if err != nil {
		return StudentAppAITutorResultArchiveRenderEnvelope{}, err
	}
	if card.CreatedAt.IsZero() {
		return StudentAppAITutorResultArchiveRenderEnvelope{}, validationError("createdAt is required")
	}
	followUpDepth, err := normalizeAITutorResultArchiveFollowUpDepth(card.FollowUpDepth)
	if err != nil {
		return StudentAppAITutorResultArchiveRenderEnvelope{}, err
	}
	blocks := []StudentAppAITutorResultArchiveRenderBlock{
		{
			BlockID:   "block_summary",
			BlockType: StudentAppAITutorResultArchiveBlockTypeSummary,
			Title:     "Summary",
			Text:      summary,
		},
	}
	for _, section := range sections {
		blocks = append(blocks, StudentAppAITutorResultArchiveRenderBlock{
			BlockID:         "block_" + section.SectionID,
			BlockType:       StudentAppAITutorResultArchiveBlockTypeGuidanceSection,
			SectionID:       section.SectionID,
			Title:           section.Title,
			Text:            section.Text,
			SourceBlockRefs: section.SourceBlockRefs,
		})
	}
	return StudentAppAITutorResultArchiveRenderEnvelope{
		ArchiveItemID:           archiveItemID,
		SourceArchiveItemID:     sourceArchiveItemID,
		SourceTutoringRequestID: sourceTutoringRequestID,
		Status:                  StudentAppAITutorResultArchiveStatusReady,
		MaterialType:            card.MaterialType,
		Title:                   title,
		RenderFormat:            StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks,
		Blocks:                  blocks,
		GuidanceSectionsHash:    hash,
		SafetyLabels:            labels,
		CreatedAt:               card.CreatedAt.UTC(),
		FollowUpDepth:           followUpDepth,
	}, nil
}
