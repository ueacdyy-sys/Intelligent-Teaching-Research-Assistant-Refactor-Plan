package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type ReadStudentAppArchiveItemLearningActions struct {
	reader StudentAppArchiveItemStudyPacketReader
}

func NewReadStudentAppArchiveItemLearningActions(
	reader StudentAppArchiveItemStudyPacketReader,
) *ReadStudentAppArchiveItemLearningActions {
	return &ReadStudentAppArchiveItemLearningActions{reader: reader}
}

func (uc *ReadStudentAppArchiveItemLearningActions) Execute(
	ctx context.Context,
	input domain.ReadStudentAppArchiveItemInput,
) (domain.StudentAppArchiveItemLearningActions, error) {
	normalized, err := domain.NormalizeReadStudentAppArchiveItemInput(input)
	if err != nil {
		return domain.StudentAppArchiveItemLearningActions{}, err
	}
	if err := domain.AuthorizeCreateStudentAppAITutorRequest(normalized.Principal); err != nil {
		return domain.StudentAppArchiveItemLearningActions{}, err
	}
	item, ok, err := uc.reader.GetPublishedForStudentApp(
		ctx,
		normalized.ArchiveItemID,
		normalized.StudentID,
	)
	if err != nil {
		return domain.StudentAppArchiveItemLearningActions{}, err
	}
	if !ok {
		return domain.StudentAppArchiveItemLearningActions{}, domain.ErrNotFound
	}
	preview, ok, err := uc.reader.GetPublishedContentPreviewForStudentApp(
		ctx,
		normalized.ArchiveItemID,
		normalized.StudentID,
	)
	if err != nil {
		return domain.StudentAppArchiveItemLearningActions{}, err
	}
	if !ok {
		return domain.StudentAppArchiveItemLearningActions{}, domain.ErrNotFound
	}
	packet, err := domain.BuildStudentAppArchiveItemStudyPacket(normalized, item, preview)
	if err != nil {
		return domain.StudentAppArchiveItemLearningActions{}, err
	}
	return domain.BuildStudentAppArchiveItemLearningActions(normalized, packet)
}
