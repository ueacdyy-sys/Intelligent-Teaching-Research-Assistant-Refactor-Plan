package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadStudentAppArchiveItemContentPreviewUsesPublishedPreviewPort(t *testing.T) {
	reader := &fakeReader{
		contentPreview:   contentPreviewFixture("tarch_archive_material_001", "student_001"),
		contentPreviewOK: true,
	}
	uc := usecase.NewReadStudentAppArchiveItemContentPreview(reader)

	preview, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemContentPreviewInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if preview.ArchiveItemID != "tarch_archive_material_001" || len(preview.Sections) != 1 {
		t.Fatalf("preview = %#v", preview)
	}
	if reader.contentPreviewReads != 1 {
		t.Fatalf("contentPreviewReads = %d, want 1", reader.contentPreviewReads)
	}
	if reader.contentPreviewArchiveID != "tarch_archive_material_001" ||
		reader.contentPreviewStudentID != "student_001" {
		t.Fatalf("preview read = %q/%q", reader.contentPreviewArchiveID, reader.contentPreviewStudentID)
	}
	if reader.genericGetReads != 0 || reader.publishedGetReads != 0 || reader.reads != 0 {
		t.Fatalf("unexpected reads list:%d generic:%d metadata:%d", reader.reads, reader.genericGetReads, reader.publishedGetReads)
	}
}

func TestReadStudentAppArchiveItemContentPreviewMapsMissingPreviewToNotFound(t *testing.T) {
	reader := &fakeReader{}
	uc := usecase.NewReadStudentAppArchiveItemContentPreview(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemContentPreviewInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
	if reader.contentPreviewReads != 1 {
		t.Fatalf("contentPreviewReads = %d, want 1", reader.contentPreviewReads)
	}
}

func TestReadStudentAppArchiveItemContentPreviewRejectsForbiddenWithoutRead(t *testing.T) {
	reader := &fakeReader{
		contentPreview:   contentPreviewFixture("tarch_archive_material_001", "student_001"),
		contentPreviewOK: true,
	}
	uc := usecase.NewReadStudentAppArchiveItemContentPreview(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemContentPreviewInput{
		Principal:     remotePrincipal(),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.contentPreviewReads != 0 {
		t.Fatalf("contentPreviewReads = %d, want 0", reader.contentPreviewReads)
	}
}

func TestReadStudentAppArchiveItemContentPreviewRejectsCrossStudentRepositoryLeak(t *testing.T) {
	reader := &fakeReader{
		contentPreview:   contentPreviewFixture("tarch_archive_material_001", "student_002"),
		contentPreviewOK: true,
	}
	uc := usecase.NewReadStudentAppArchiveItemContentPreview(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemContentPreviewInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func contentPreviewFixture(
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
				ID:       "section_001",
				Title:    "Learning goals",
				Text:     "Practice equivalent fractions and common denominators.",
				PageHint: "p.1",
			},
		},
		CreatedAt: createdAt,
		UpdatedAt: createdAt.Add(5 * time.Minute),
	}
}
