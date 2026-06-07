package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type StudentAppArchiveItemStudyPacketReader interface {
	StudentAppPublishedArchiveMaterialDetailReader
	StudentAppArchiveItemContentPreviewReader
}

type ReadStudentAppArchiveItemStudyPacket struct {
	reader StudentAppArchiveItemStudyPacketReader
}

func NewReadStudentAppArchiveItemStudyPacket(
	reader StudentAppArchiveItemStudyPacketReader,
) *ReadStudentAppArchiveItemStudyPacket {
	return &ReadStudentAppArchiveItemStudyPacket{reader: reader}
}

func (uc *ReadStudentAppArchiveItemStudyPacket) Execute(
	ctx context.Context,
	input domain.ReadStudentAppArchiveItemInput,
) (domain.StudentAppArchiveItemStudyPacket, error) {
	normalized, err := domain.NormalizeReadStudentAppArchiveItemInput(input)
	if err != nil {
		return domain.StudentAppArchiveItemStudyPacket{}, err
	}
	item, ok, err := uc.reader.GetPublishedForStudentApp(
		ctx,
		normalized.ArchiveItemID,
		normalized.StudentID,
	)
	if err != nil {
		return domain.StudentAppArchiveItemStudyPacket{}, err
	}
	if !ok {
		return domain.StudentAppArchiveItemStudyPacket{}, domain.ErrNotFound
	}
	preview, ok, err := uc.reader.GetPublishedContentPreviewForStudentApp(
		ctx,
		normalized.ArchiveItemID,
		normalized.StudentID,
	)
	if err != nil {
		return domain.StudentAppArchiveItemStudyPacket{}, err
	}
	if !ok {
		return domain.StudentAppArchiveItemStudyPacket{}, domain.ErrNotFound
	}
	return domain.BuildStudentAppArchiveItemStudyPacket(normalized, item, preview)
}
