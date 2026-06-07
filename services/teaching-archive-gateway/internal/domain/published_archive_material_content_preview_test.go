package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeReadStudentAppArchiveItemContentPreviewScopesOwnPublishedItem(t *testing.T) {
	input, err := domain.NormalizeReadStudentAppArchiveItemContentPreviewInput(
		domain.ReadStudentAppArchiveItemContentPreviewInput{
			Principal:     studentPrincipal("student_001"),
			ArchiveItemID: " tarch_archive_material_001 ",
		},
	)
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppArchiveItemContentPreviewInput returned error: %v", err)
	}
	if input.ArchiveItemID != "tarch_archive_material_001" || input.StudentID != "student_001" {
		t.Fatalf("input = %#v", input)
	}
}

func TestNormalizePublishedArchiveMaterialContentPreviewValidatesSafePreview(t *testing.T) {
	preview, err := domain.NormalizePublishedArchiveMaterialContentPreview(
		publishedArchiveMaterialContentPreviewFixture(),
	)
	if err != nil {
		t.Fatalf("NormalizePublishedArchiveMaterialContentPreview returned error: %v", err)
	}
	if preview.Status != domain.PublishedArchiveMaterialContentPreviewStatusReady {
		t.Fatalf("Status = %q", preview.Status)
	}
	if preview.PreviewSource != domain.PublishedArchiveMaterialContentPreviewSourceSafeReviewed {
		t.Fatalf("PreviewSource = %q", preview.PreviewSource)
	}
	if len(preview.Sections) != 2 {
		t.Fatalf("sections = %#v", preview.Sections)
	}
}

func TestNormalizePublishedArchiveMaterialContentPreviewRejectsUnsafeFields(t *testing.T) {
	for name, mutate := range map[string]func(*domain.PublishedArchiveMaterialContentPreview){
		"teaching material": func(preview *domain.PublishedArchiveMaterialContentPreview) {
			preview.MaterialType = domain.MaterialTypeTeachingMaterial
		},
		"raw html": func(preview *domain.PublishedArchiveMaterialContentPreview) {
			preview.Sections[0].Text = "<script>alert(1)</script>"
		},
		"duplicate section": func(preview *domain.PublishedArchiveMaterialContentPreview) {
			preview.Sections[1].ID = preview.Sections[0].ID
		},
		"too many sections": func(preview *domain.PublishedArchiveMaterialContentPreview) {
			preview.Sections = make([]domain.PublishedArchiveMaterialContentPreviewSection, 21)
			for index := range preview.Sections {
				preview.Sections[index] = domain.PublishedArchiveMaterialContentPreviewSection{
					ID:    "section_many_" + string(rune('a'+index)),
					Title: "Summary",
					Text:  "Safe preview text.",
				}
			}
		},
		"missing timestamp": func(preview *domain.PublishedArchiveMaterialContentPreview) {
			preview.UpdatedAt = time.Time{}
		},
	} {
		t.Run(name, func(t *testing.T) {
			preview := publishedArchiveMaterialContentPreviewFixture()
			mutate(&preview)
			_, err := domain.NormalizePublishedArchiveMaterialContentPreview(preview)
			if !errors.Is(err, domain.ErrValidation) {
				t.Fatalf("error = %v, want ErrValidation", err)
			}
		})
	}
}

func TestBuildStudentAppArchiveItemContentPreviewRejectsCrossStudentOrWrongItem(t *testing.T) {
	input, err := domain.NormalizeReadStudentAppArchiveItemContentPreviewInput(
		domain.ReadStudentAppArchiveItemContentPreviewInput{
			Principal:     studentPrincipal("student_001"),
			ArchiveItemID: "tarch_archive_material_001",
		},
	)
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppArchiveItemContentPreviewInput returned error: %v", err)
	}

	for name, mutate := range map[string]func(*domain.PublishedArchiveMaterialContentPreview){
		"cross student": func(preview *domain.PublishedArchiveMaterialContentPreview) {
			preview.StudentID = "student_002"
		},
		"wrong item": func(preview *domain.PublishedArchiveMaterialContentPreview) {
			preview.ArchiveItemID = "tarch_archive_material_other"
		},
	} {
		t.Run(name, func(t *testing.T) {
			preview := publishedArchiveMaterialContentPreviewFixture()
			mutate(&preview)
			_, err := domain.BuildStudentAppArchiveItemContentPreview(input, preview)
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
		})
	}
}

func TestBuildStudentAppArchiveItemContentPreviewRenderEnvelopeUsesSafeTextBlocks(t *testing.T) {
	input, err := domain.NormalizeReadStudentAppArchiveItemContentPreviewInput(
		domain.ReadStudentAppArchiveItemContentPreviewInput{
			Principal:     studentPrincipal("student_001"),
			ArchiveItemID: "tarch_archive_material_001",
		},
	)
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppArchiveItemContentPreviewInput returned error: %v", err)
	}

	rendered, err := domain.BuildStudentAppArchiveItemContentPreviewRenderEnvelope(
		input,
		publishedArchiveMaterialContentPreviewFixture(),
	)
	if err != nil {
		t.Fatalf("BuildStudentAppArchiveItemContentPreviewRenderEnvelope returned error: %v", err)
	}
	if rendered.RenderFormat != domain.PublishedArchiveMaterialContentPreviewRenderFormatSafeTextBlocks {
		t.Fatalf("RenderFormat = %q", rendered.RenderFormat)
	}
	if rendered.PreviewStatus != domain.PublishedArchiveMaterialContentPreviewStatusReady {
		t.Fatalf("PreviewStatus = %q", rendered.PreviewStatus)
	}
	if len(rendered.Blocks) != 2 {
		t.Fatalf("blocks = %#v", rendered.Blocks)
	}
	if rendered.Blocks[0].BlockType != domain.PublishedArchiveMaterialContentPreviewBlockTypeSection ||
		rendered.Blocks[0].Text != "Practice equivalent fractions and common denominators." ||
		rendered.Blocks[0].SectionID != "section_001" {
		t.Fatalf("block = %#v", rendered.Blocks[0])
	}
}

func TestBuildStudentAppArchiveItemContentPreviewRenderEnvelopeRejectsCrossStudentRepositoryLeak(t *testing.T) {
	input, err := domain.NormalizeReadStudentAppArchiveItemContentPreviewInput(
		domain.ReadStudentAppArchiveItemContentPreviewInput{
			Principal:     studentPrincipal("student_001"),
			ArchiveItemID: "tarch_archive_material_001",
		},
	)
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppArchiveItemContentPreviewInput returned error: %v", err)
	}
	preview := publishedArchiveMaterialContentPreviewFixture()
	preview.StudentID = "student_002"

	_, err = domain.BuildStudentAppArchiveItemContentPreviewRenderEnvelope(input, preview)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func publishedArchiveMaterialContentPreviewFixture() domain.PublishedArchiveMaterialContentPreview {
	createdAt := time.Date(2026, 6, 7, 9, 0, 0, 0, time.UTC)
	return domain.PublishedArchiveMaterialContentPreview{
		ArchiveItemID: "tarch_archive_material_001",
		StudentID:     "student_001",
		MaterialType:  domain.MaterialTypeHandout,
		Title:         "Fractions practice packet",
		Status:        domain.PublishedArchiveMaterialContentPreviewStatusReady,
		PreviewSource: domain.PublishedArchiveMaterialContentPreviewSourceSafeReviewed,
		Sections: []domain.PublishedArchiveMaterialContentPreviewSection{
			{
				ID:       "section_001",
				Title:    "Learning goals",
				Text:     "Practice equivalent fractions and common denominators.",
				PageHint: "p.1",
			},
			{
				ID:    "section_002",
				Title: "Warm-up",
				Text:  "Compare 1/2, 2/3, and 3/4 using a shared denominator.",
			},
		},
		CreatedAt: createdAt,
		UpdatedAt: createdAt.Add(5 * time.Minute),
	}
}
