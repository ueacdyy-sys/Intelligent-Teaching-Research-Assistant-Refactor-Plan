package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadStudentAppArchiveItemUsesPublishedProjectionDetailPort(t *testing.T) {
	reader := &fakeReader{
		item: archiveItem("tarch_archive_material_001", "student_001", time.Date(2026, 6, 7, 8, 0, 0, 0, time.UTC)),
		ok:   true,
	}
	uc := usecase.NewReadStudentAppArchiveItem(reader)

	item, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if item.ID != "tarch_archive_material_001" {
		t.Fatalf("item ID = %q", item.ID)
	}
	if reader.reads != 0 {
		t.Fatalf("generic reads = %d, want 0", reader.reads)
	}
	if reader.publishedReads != 0 {
		t.Fatalf("published list reads = %d, want 0", reader.publishedReads)
	}
	if reader.genericGetReads != 0 {
		t.Fatalf("generic get reads = %d, want 0", reader.genericGetReads)
	}
	if reader.publishedGetReads != 1 {
		t.Fatalf("published get reads = %d, want 1", reader.publishedGetReads)
	}
	if reader.publishedGetArchiveItemID != "tarch_archive_material_001" ||
		reader.publishedGetStudentID != "student_001" {
		t.Fatalf("published get = %q/%q", reader.publishedGetArchiveItemID, reader.publishedGetStudentID)
	}
}

func TestReadStudentAppArchiveItemMapsMissingPublishedProjectionToNotFound(t *testing.T) {
	reader := &fakeReader{}
	uc := usecase.NewReadStudentAppArchiveItem(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
	if reader.publishedGetReads != 1 {
		t.Fatalf("published get reads = %d, want 1", reader.publishedGetReads)
	}
}

func TestReadStudentAppArchiveItemRejectsForbiddenWithoutRepositoryRead(t *testing.T) {
	reader := &fakeReader{}
	uc := usecase.NewReadStudentAppArchiveItem(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     remotePrincipal(),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.publishedGetReads != 0 || reader.reads != 0 || reader.genericGetReads != 0 {
		t.Fatalf("repository reads = list:%d genericGet:%d publishedGet:%d", reader.reads, reader.genericGetReads, reader.publishedGetReads)
	}
}

func TestReadStudentAppArchiveItemRejectsCrossStudentRepositoryLeak(t *testing.T) {
	reader := &fakeReader{
		item: archiveItem("tarch_archive_material_001", "student_002", time.Date(2026, 6, 7, 8, 0, 0, 0, time.UTC)),
		ok:   true,
	}
	uc := usecase.NewReadStudentAppArchiveItem(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}
