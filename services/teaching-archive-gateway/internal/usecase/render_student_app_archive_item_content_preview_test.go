package usecase_test

import (
	"context"
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestRenderStudentAppArchiveItemContentPreviewUsesPublishedPreviewPort(t *testing.T) {
	reader := &fakeReader{
		contentPreview:   contentPreviewFixture("tarch_archive_material_001", "student_001"),
		contentPreviewOK: true,
	}
	uc := usecase.NewRenderStudentAppArchiveItemContentPreview(reader)

	rendered, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemContentPreviewInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if rendered.RenderFormat != domain.PublishedArchiveMaterialContentPreviewRenderFormatSafeTextBlocks ||
		len(rendered.Blocks) != 1 {
		t.Fatalf("rendered = %#v", rendered)
	}
	if reader.contentPreviewReads != 1 {
		t.Fatalf("contentPreviewReads = %d, want 1", reader.contentPreviewReads)
	}
	if reader.genericGetReads != 0 || reader.publishedGetReads != 0 || reader.reads != 0 {
		t.Fatalf("unexpected reads list:%d generic:%d metadata:%d", reader.reads, reader.genericGetReads, reader.publishedGetReads)
	}
}

func TestRenderStudentAppArchiveItemContentPreviewMapsMissingPreviewToNotFound(t *testing.T) {
	reader := &fakeReader{}
	uc := usecase.NewRenderStudentAppArchiveItemContentPreview(reader)

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

func TestRenderStudentAppArchiveItemContentPreviewRejectsForbiddenWithoutRead(t *testing.T) {
	reader := &fakeReader{
		contentPreview:   contentPreviewFixture("tarch_archive_material_001", "student_001"),
		contentPreviewOK: true,
	}
	uc := usecase.NewRenderStudentAppArchiveItemContentPreview(reader)

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

func TestRenderStudentAppArchiveItemContentPreviewRejectsCrossStudentRepositoryLeak(t *testing.T) {
	reader := &fakeReader{
		contentPreview:   contentPreviewFixture("tarch_archive_material_001", "student_002"),
		contentPreviewOK: true,
	}
	uc := usecase.NewRenderStudentAppArchiveItemContentPreview(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemContentPreviewInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}
