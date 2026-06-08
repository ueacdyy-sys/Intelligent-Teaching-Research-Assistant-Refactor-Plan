package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeListStudentAppArchiveItemsScopesOwnStudentArchive(t *testing.T) {
	query, err := domain.NormalizeListStudentAppArchiveItemsInput(domain.ListStudentAppArchiveItemsInput{
		Principal:    studentPrincipal("student_001"),
		MaterialType: domain.MaterialTypeHandout,
		Query:        "  fractions   packet  ",
		PageSize:     25,
	})
	if err != nil {
		t.Fatalf("NormalizeListStudentAppArchiveItemsInput returned error: %v", err)
	}
	if query.OwnerType != domain.OwnerTypeStudent {
		t.Fatalf("OwnerType = %q", query.OwnerType)
	}
	if query.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", query.StudentID)
	}
	if query.MaterialType != domain.MaterialTypeHandout {
		t.Fatalf("MaterialType = %q", query.MaterialType)
	}
	if query.SearchText != "fractions packet" {
		t.Fatalf("SearchText = %q", query.SearchText)
	}
	if query.FetchLimit != 26 {
		t.Fatalf("FetchLimit = %d", query.FetchLimit)
	}
}

func TestNormalizeListStudentAppArchiveItemsRejectsUnsafeQuery(t *testing.T) {
	for name, query := range map[string]string{
		"too long":         "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"control char":     "fractions\npacket",
		"control tab char": "fractions\tpacket",
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeListStudentAppArchiveItemsInput(domain.ListStudentAppArchiveItemsInput{
				Principal: studentPrincipal("student_001"),
				Query:     query,
			})
			if !errors.Is(err, domain.ErrValidation) {
				t.Fatalf("error = %v, want ErrValidation", err)
			}
		})
	}
}

func TestNormalizeListStudentAppArchiveItemsRejectsTeachingMaterialFilter(t *testing.T) {
	_, err := domain.NormalizeListStudentAppArchiveItemsInput(domain.ListStudentAppArchiveItemsInput{
		Principal:    studentPrincipal("student_001"),
		MaterialType: domain.MaterialTypeTeachingMaterial,
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestNormalizeListStudentAppArchiveItemsRejectsNonStudentAppPrincipals(t *testing.T) {
	studentWithoutOwnRead := studentPrincipal("student_001")
	studentWithoutOwnRead.Scopes = []domain.Scope{domain.ScopeTeachingRead}

	for name, principal := range map[string]domain.PrincipalContext{
		"teacher desktop":  teacherPrincipal(),
		"remote social":    remoteSocialPrincipal(),
		"service":          servicePrincipal(),
		"missing own read": studentWithoutOwnRead,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeListStudentAppArchiveItemsInput(domain.ListStudentAppArchiveItemsInput{
				Principal: principal,
			})
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
		})
	}
}

func TestNormalizeReadStudentAppArchiveItemScopesOwnPublishedDetail(t *testing.T) {
	input, err := domain.NormalizeReadStudentAppArchiveItemInput(domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: " tarch_archive_material_001 ",
	})
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppArchiveItemInput returned error: %v", err)
	}
	if input.ArchiveItemID != "tarch_archive_material_001" {
		t.Fatalf("ArchiveItemID = %q", input.ArchiveItemID)
	}
	if input.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", input.StudentID)
	}
}

func TestNormalizeReadStudentAppArchiveItemRejectsUnsafeIDs(t *testing.T) {
	for name, archiveItemID := range map[string]string{
		"missing prefix": "archive_material_001",
		"empty suffix":   "tarch_",
		"path token":     "tarch_archive/material",
		"query token":    "tarch_archive?material",
		"space token":    "tarch_archive material",
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeReadStudentAppArchiveItemInput(domain.ReadStudentAppArchiveItemInput{
				Principal:     studentPrincipal("student_001"),
				ArchiveItemID: archiveItemID,
			})
			if !errors.Is(err, domain.ErrValidation) {
				t.Fatalf("error = %v, want ErrValidation", err)
			}
		})
	}
}

func TestNormalizeReadStudentAppArchiveItemRejectsNonStudentAppPrincipals(t *testing.T) {
	_, err := domain.NormalizeReadStudentAppArchiveItemInput(domain.ReadStudentAppArchiveItemInput{
		Principal:     teacherPrincipal(),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestBuildStudentAppArchiveItemMetadataRejectsCrossStudentOrTeachingMaterial(t *testing.T) {
	input, err := domain.NormalizeReadStudentAppArchiveItemInput(domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppArchiveItemInput returned error: %v", err)
	}

	for name, item := range map[string]domain.ArchiveItem{
		"cross student": {
			ID:           "tarch_archive_material_001",
			OwnerType:    domain.OwnerTypeStudent,
			StudentID:    "student_002",
			MaterialType: domain.MaterialTypeHandout,
		},
		"teaching material": {
			ID:           "tarch_archive_material_001",
			OwnerType:    domain.OwnerTypeStudent,
			StudentID:    "student_001",
			MaterialType: domain.MaterialTypeTeachingMaterial,
		},
		"teaching owner": {
			ID:           "tarch_archive_material_001",
			OwnerType:    domain.OwnerTypeTeaching,
			MaterialType: domain.MaterialTypeHandout,
		},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.BuildStudentAppArchiveItemMetadata(input, item)
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
		})
	}
}

func TestBuildStudentAppArchiveItemStudyPacketCombinesSafeMetadataAndRenderedPreview(t *testing.T) {
	input, err := domain.NormalizeReadStudentAppArchiveItemInput(domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppArchiveItemInput returned error: %v", err)
	}

	packet, err := domain.BuildStudentAppArchiveItemStudyPacket(
		input,
		domain.ArchiveItem{
			ID:              "tarch_archive_material_001",
			OwnerType:       domain.OwnerTypeStudent,
			StudentID:       "student_001",
			MaterialType:    domain.MaterialTypeHandout,
			Title:           "Fractions practice packet",
			Source:          domain.SourceSystemImport,
			ContentRef:      "precommit://archive-material/student_001/fractions-packet",
			Tags:            []string{"fractions"},
			AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
			OCRStatus:       domain.OCRStatusNotRequired,
		},
		studentAppStudyPacketContentPreviewFixture("tarch_archive_material_001", "student_001"),
	)
	if err != nil {
		t.Fatalf("BuildStudentAppArchiveItemStudyPacket returned error: %v", err)
	}
	if packet.PacketStatus != domain.StudentAppArchiveItemStudyPacketStatusReady {
		t.Fatalf("PacketStatus = %q", packet.PacketStatus)
	}
	if packet.ArchiveItem.ID != "tarch_archive_material_001" ||
		packet.ArchiveItem.ContentRef != "precommit://archive-material/student_001/fractions-packet" {
		t.Fatalf("ArchiveItem = %#v", packet.ArchiveItem)
	}
	if packet.ContentPreview.RenderFormat != domain.PublishedArchiveMaterialContentPreviewRenderFormatSafeTextBlocks ||
		len(packet.ContentPreview.Blocks) != 1 {
		t.Fatalf("ContentPreview = %#v", packet.ContentPreview)
	}
}

func TestBuildStudentAppArchiveItemStudyPacketRejectsPreviewMetadataMismatch(t *testing.T) {
	input, err := domain.NormalizeReadStudentAppArchiveItemInput(domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppArchiveItemInput returned error: %v", err)
	}
	preview := studentAppStudyPacketContentPreviewFixture("tarch_archive_material_001", "student_001")
	preview.Title = "Different title"

	_, err = domain.BuildStudentAppArchiveItemStudyPacket(
		input,
		domain.ArchiveItem{
			ID:           "tarch_archive_material_001",
			OwnerType:    domain.OwnerTypeStudent,
			StudentID:    "student_001",
			MaterialType: domain.MaterialTypeHandout,
			Title:        "Fractions practice packet",
		},
		preview,
	)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestBuildStudentAppArchiveItemLearningActionsRequiresReadyStudyPacket(t *testing.T) {
	input, err := domain.NormalizeReadStudentAppArchiveItemInput(domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppArchiveItemInput returned error: %v", err)
	}
	packet, err := domain.BuildStudentAppArchiveItemStudyPacket(
		input,
		domain.ArchiveItem{
			ID:              "tarch_archive_material_001",
			OwnerType:       domain.OwnerTypeStudent,
			StudentID:       "student_001",
			MaterialType:    domain.MaterialTypeHandout,
			Title:           "Fractions practice packet",
			Source:          domain.SourceSystemImport,
			Tags:            []string{"fractions"},
			AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentTutoring},
			OCRStatus:       domain.OCRStatusNotRequired,
		},
		studentAppStudyPacketContentPreviewFixture("tarch_archive_material_001", "student_001"),
	)
	if err != nil {
		t.Fatalf("BuildStudentAppArchiveItemStudyPacket returned error: %v", err)
	}

	actions, err := domain.BuildStudentAppArchiveItemLearningActions(input, packet)
	if err != nil {
		t.Fatalf("BuildStudentAppArchiveItemLearningActions returned error: %v", err)
	}
	if actions.ArchiveItemID != "tarch_archive_material_001" ||
		actions.PacketStatus != domain.StudentAppArchiveItemStudyPacketStatusReady ||
		len(actions.Actions) != 2 {
		t.Fatalf("actions = %#v", actions)
	}
	first := actions.Actions[0]
	if first.ActionType != domain.StudentAppArchiveItemLearningActionAITutorRequest ||
		first.State != domain.StudentAppArchiveItemLearningActionAvailable ||
		first.TargetEndpoint != "/v1/student-app/ai-tutor-requests" ||
		first.Method != "POST" ||
		first.QuestionBankIntent != domain.QuestionBankIntentGeneratePersonalizedCheck {
		t.Fatalf("first action = %#v", first)
	}
	second := actions.Actions[1]
	if second.ActionType != domain.StudentAppArchiveItemLearningActionPersonalizedQuestionBank ||
		second.State != domain.StudentAppArchiveItemLearningActionDeferredThroughAITutor ||
		!second.RequiresTutorRequest {
		t.Fatalf("second action = %#v", second)
	}
}

func TestBuildStudentAppArchiveItemLearningActionsRejectsPacketMismatch(t *testing.T) {
	input, err := domain.NormalizeReadStudentAppArchiveItemInput(domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppArchiveItemInput returned error: %v", err)
	}
	packet := domain.StudentAppArchiveItemStudyPacket{
		PacketStatus: domain.StudentAppArchiveItemStudyPacketStatusReady,
		ArchiveItem: domain.ArchiveItem{
			ID:           "tarch_archive_material_other",
			OwnerType:    domain.OwnerTypeStudent,
			StudentID:    "student_001",
			MaterialType: domain.MaterialTypeHandout,
			Title:        "Fractions practice packet",
		},
	}

	_, err = domain.BuildStudentAppArchiveItemLearningActions(input, packet)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func studentAppStudyPacketContentPreviewFixture(
	archiveItemID string,
	studentID string,
) domain.PublishedArchiveMaterialContentPreview {
	createdAt := time.Date(2026, 6, 7, 9, 0, 0, 0, time.UTC)
	return domain.PublishedArchiveMaterialContentPreview{
		ArchiveItemID: archiveItemID,
		StudentID:     studentID,
		MaterialType:  domain.MaterialTypeHandout,
		Title:         "Fractions practice packet",
		Status:        domain.PublishedArchiveMaterialContentPreviewStatusReady,
		PreviewSource: domain.PublishedArchiveMaterialContentPreviewSourceSafeReviewed,
		Sections: []domain.PublishedArchiveMaterialContentPreviewSection{
			{
				ID:    "section_001",
				Title: "Learning goals",
				Text:  "Practice equivalent fractions and common denominators.",
			},
		},
		CreatedAt: createdAt,
		UpdatedAt: createdAt.Add(5 * time.Minute),
	}
}
