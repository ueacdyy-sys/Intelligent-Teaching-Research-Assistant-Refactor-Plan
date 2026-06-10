package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestBuildStudentAppAITutorResultArchiveRenderEnvelopeReturnsSafeTextBlocks(t *testing.T) {
	rendered, err := domain.BuildStudentAppAITutorResultArchiveRenderEnvelope(aiTutorResultArchiveCardFixture())
	if err != nil {
		t.Fatalf("BuildStudentAppAITutorResultArchiveRenderEnvelope returned error: %v", err)
	}
	if rendered.RenderFormat != domain.StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks ||
		rendered.Status != domain.StudentAppAITutorResultArchiveStatusReady ||
		rendered.ArchiveItemID != "tarch_student_ai_tutor_result_001" ||
		rendered.SourceArchiveItemID != "tarch_source_student_homework_001" ||
		rendered.SourceTutoringRequestID != "tutor_req_student_app_001" {
		t.Fatalf("rendered = %#v", rendered)
	}
	if len(rendered.Blocks) != 3 {
		t.Fatalf("blocks = %#v", rendered.Blocks)
	}
	if rendered.Blocks[0].BlockType != domain.StudentAppAITutorResultArchiveBlockTypeSummary ||
		rendered.Blocks[0].Text != "Guided help for comparing fractions." {
		t.Fatalf("summary block = %#v", rendered.Blocks[0])
	}
	if rendered.Blocks[1].BlockType != domain.StudentAppAITutorResultArchiveBlockTypeGuidanceSection ||
		rendered.Blocks[1].SectionID != "ai_tutor_answer_section_001" ||
		rendered.Blocks[1].Text != "Convert both fractions to the same denominator, then compare the numerators." {
		t.Fatalf("guidance block = %#v", rendered.Blocks[1])
	}
}

func TestBuildStudentAppAITutorResultArchiveRenderEnvelopeRejectsUnsafeCard(t *testing.T) {
	for name, mutate := range map[string]func(*domain.StudentAppAITutorResultArchiveCard){
		"wrong status": func(card *domain.StudentAppAITutorResultArchiveCard) {
			card.Status = ""
		},
		"unsafe text": func(card *domain.StudentAppAITutorResultArchiveCard) {
			card.GuidanceSections[0].Text = "<script>alert(1)</script>"
		},
		"missing timestamp": func(card *domain.StudentAppAITutorResultArchiveCard) {
			card.CreatedAt = time.Time{}
		},
		"missing source archive item": func(card *domain.StudentAppAITutorResultArchiveCard) {
			card.SourceArchiveItemID = ""
		},
		"missing source tutoring request": func(card *domain.StudentAppAITutorResultArchiveCard) {
			card.SourceTutoringRequestID = ""
		},
	} {
		t.Run(name, func(t *testing.T) {
			card := aiTutorResultArchiveCardFixture()
			mutate(&card)
			_, err := domain.BuildStudentAppAITutorResultArchiveRenderEnvelope(card)
			if !errors.Is(err, domain.ErrForbidden) && !errors.Is(err, domain.ErrValidation) {
				t.Fatalf("error = %v, want ErrForbidden or ErrValidation", err)
			}
		})
	}
}

func aiTutorResultArchiveCardFixture() domain.StudentAppAITutorResultArchiveCard {
	return domain.StudentAppAITutorResultArchiveCard{
		ArchiveItemID:           "tarch_student_ai_tutor_result_001",
		SourceArchiveItemID:     "tarch_source_student_homework_001",
		SourceTutoringRequestID: "tutor_req_student_app_001",
		Status:                  domain.StudentAppAITutorResultArchiveStatusReady,
		MaterialType:            domain.MaterialTypeHomework,
		Title:                   "Student AI Tutor result archive tutor_req_student_app_001",
		Source:                  domain.SourceSystemImport,
		Tags:                    []string{"student_app_ai_tutor", "result", "safe_guidance", "archive_commit"},
		AnalysisIntents:         []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly, domain.AnalysisIntentTutoring},
		OCRStatus:               domain.OCRStatusNotRequired,
		Summary:                 "Guided help for comparing fractions.",
		GuidanceSectionsHash:    "05a82687de1587bfc882ecf8ec4f54421da7ff0ab4e911cd0af88d4ffbecec4b",
		SafetyLabels:            []string{"NO_DIAGNOSIS", "STUDY_GUIDANCE_ONLY"},
		CreatedAt:               time.Date(2026, 6, 8, 12, 20, 0, 0, time.UTC),
		GuidanceSections: []domain.StudentAppAITutorResultArchiveGuidanceSection{
			{
				SectionID:       "ai_tutor_answer_section_001",
				Title:           "Start with a common denominator",
				Text:            "Convert both fractions to the same denominator, then compare the numerators.",
				SourceBlockRefs: []string{"block_section_001"},
			},
			{
				SectionID:       "ai_tutor_answer_section_002",
				Title:           "Check your reasoning",
				Text:            "Explain why the larger numerator is larger only after the denominators match.",
				SourceBlockRefs: []string{"block_section_002"},
			},
		},
	}
}
