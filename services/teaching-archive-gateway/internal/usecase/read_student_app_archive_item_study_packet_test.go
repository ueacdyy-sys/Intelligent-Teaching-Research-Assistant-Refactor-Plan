package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadStudentAppArchiveItemStudyPacketUsesPublishedDetailAndSafePreviewPorts(t *testing.T) {
	reader := &fakeReader{
		item:             archiveItem("tarch_archive_material_001", "student_001", time.Date(2026, 6, 7, 8, 0, 0, 0, time.UTC)),
		ok:               true,
		contentPreview:   contentPreviewFixture("tarch_archive_material_001", "student_001"),
		contentPreviewOK: true,
	}
	reader.item.Title = "Fractions practice packet"
	reader.item.MaterialType = domain.MaterialTypeHandout
	reader.contentPreview.Title = "Fractions practice packet"
	reader.contentPreview.MaterialType = domain.MaterialTypeHandout
	uc := usecase.NewReadStudentAppArchiveItemStudyPacket(reader)

	packet, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if packet.PacketStatus != domain.StudentAppArchiveItemStudyPacketStatusReady ||
		packet.ContentPreview.RenderFormat != domain.PublishedArchiveMaterialContentPreviewRenderFormatSafeTextBlocks {
		t.Fatalf("packet = %#v", packet)
	}
	if reader.publishedGetReads != 1 || reader.contentPreviewReads != 1 {
		t.Fatalf("reads detail:%d preview:%d", reader.publishedGetReads, reader.contentPreviewReads)
	}
	if reader.genericGetReads != 0 || reader.reads != 0 || reader.publishedReads != 0 {
		t.Fatalf("unexpected reads list:%d publishedList:%d generic:%d", reader.reads, reader.publishedReads, reader.genericGetReads)
	}
}

func TestReadStudentAppArchiveItemStudyPacketDoesNotReadPreviewWhenDetailMissing(t *testing.T) {
	reader := &fakeReader{
		contentPreview:   contentPreviewFixture("tarch_archive_material_001", "student_001"),
		contentPreviewOK: true,
	}
	uc := usecase.NewReadStudentAppArchiveItemStudyPacket(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
	if reader.publishedGetReads != 1 || reader.contentPreviewReads != 0 {
		t.Fatalf("reads detail:%d preview:%d", reader.publishedGetReads, reader.contentPreviewReads)
	}
}

func TestReadStudentAppArchiveItemStudyPacketRejectsForbiddenWithoutRead(t *testing.T) {
	reader := &fakeReader{
		item:             archiveItem("tarch_archive_material_001", "student_001", time.Date(2026, 6, 7, 8, 0, 0, 0, time.UTC)),
		ok:               true,
		contentPreview:   contentPreviewFixture("tarch_archive_material_001", "student_001"),
		contentPreviewOK: true,
	}
	uc := usecase.NewReadStudentAppArchiveItemStudyPacket(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     remotePrincipal(),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.publishedGetReads != 0 || reader.contentPreviewReads != 0 {
		t.Fatalf("reads detail:%d preview:%d", reader.publishedGetReads, reader.contentPreviewReads)
	}
}

func TestReadStudentAppArchiveItemStudyPacketRejectsPreviewMismatch(t *testing.T) {
	reader := &fakeReader{
		item:             archiveItem("tarch_archive_material_001", "student_001", time.Date(2026, 6, 7, 8, 0, 0, 0, time.UTC)),
		ok:               true,
		contentPreview:   contentPreviewFixture("tarch_archive_material_001", "student_001"),
		contentPreviewOK: true,
	}
	reader.item.Title = "Fractions practice packet"
	reader.item.MaterialType = domain.MaterialTypeHandout
	reader.contentPreview.Title = "Different title"
	reader.contentPreview.MaterialType = domain.MaterialTypeHandout
	uc := usecase.NewReadStudentAppArchiveItemStudyPacket(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestReadStudentAppArchiveItemLearningActionsUsesReadyStudyPacketPorts(t *testing.T) {
	reader := &fakeReader{
		item:             archiveItem("tarch_archive_material_001", "student_001", time.Date(2026, 6, 7, 8, 0, 0, 0, time.UTC)),
		ok:               true,
		contentPreview:   contentPreviewFixture("tarch_archive_material_001", "student_001"),
		contentPreviewOK: true,
	}
	reader.item.Title = "Fractions practice packet"
	reader.item.MaterialType = domain.MaterialTypeHandout
	reader.contentPreview.Title = "Fractions practice packet"
	reader.contentPreview.MaterialType = domain.MaterialTypeHandout
	uc := usecase.NewReadStudentAppArchiveItemLearningActions(reader)

	actions, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if actions.ArchiveItemID != "tarch_archive_material_001" || len(actions.Actions) != 2 {
		t.Fatalf("actions = %#v", actions)
	}
	if reader.publishedGetReads != 1 || reader.contentPreviewReads != 1 {
		t.Fatalf("reads detail:%d preview:%d", reader.publishedGetReads, reader.contentPreviewReads)
	}
	if reader.genericGetReads != 0 || reader.reads != 0 || reader.publishedReads != 0 {
		t.Fatalf("unexpected reads list:%d publishedList:%d generic:%d", reader.reads, reader.publishedReads, reader.genericGetReads)
	}
}

func TestReadStudentAppArchiveItemLearningActionsRejectsForbiddenWithoutRead(t *testing.T) {
	reader := &fakeReader{
		item:             archiveItem("tarch_archive_material_001", "student_001", time.Date(2026, 6, 7, 8, 0, 0, 0, time.UTC)),
		ok:               true,
		contentPreview:   contentPreviewFixture("tarch_archive_material_001", "student_001"),
		contentPreviewOK: true,
	}
	uc := usecase.NewReadStudentAppArchiveItemLearningActions(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     remotePrincipal(),
		ArchiveItemID: "tarch_archive_material_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.publishedGetReads != 0 || reader.contentPreviewReads != 0 {
		t.Fatalf("reads detail:%d preview:%d", reader.publishedGetReads, reader.contentPreviewReads)
	}
}
