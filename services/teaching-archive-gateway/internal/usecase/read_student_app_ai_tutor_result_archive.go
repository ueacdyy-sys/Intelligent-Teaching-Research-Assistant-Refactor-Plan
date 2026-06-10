package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type StudentAppAITutorResultArchiveReader interface {
	GetByID(ctx context.Context, id string) (domain.ArchiveItem, bool, error)
	StudentAppAITutorResultArchiveSnapshotReader
}

type StudentAppAITutorResultArchiveSnapshotReader interface {
	GetStudentAppAITutorResultArchiveSnapshot(
		ctx context.Context,
		archiveItemID string,
		studentID string,
	) (domain.StudentAppAITutorResultArchiveSnapshot, bool, error)
}

type ReadStudentAppAITutorResultArchive struct {
	reader StudentAppAITutorResultArchiveReader
}

func NewReadStudentAppAITutorResultArchive(
	reader StudentAppAITutorResultArchiveReader,
) *ReadStudentAppAITutorResultArchive {
	return &ReadStudentAppAITutorResultArchive{reader: reader}
}

func (uc *ReadStudentAppAITutorResultArchive) Execute(
	ctx context.Context,
	input domain.ReadStudentAppArchiveItemInput,
) (domain.StudentAppAITutorResultArchiveCard, error) {
	normalized, err := domain.NormalizeReadStudentAppArchiveItemInput(input)
	if err != nil {
		return domain.StudentAppAITutorResultArchiveCard{}, err
	}
	item, ok, err := uc.reader.GetByID(ctx, normalized.ArchiveItemID)
	if err != nil {
		return domain.StudentAppAITutorResultArchiveCard{}, err
	}
	if !ok {
		return domain.StudentAppAITutorResultArchiveCard{}, domain.ErrNotFound
	}
	if err := domain.ValidateStudentAppAITutorResultArchiveItem(normalized, item); err != nil {
		return domain.StudentAppAITutorResultArchiveCard{}, err
	}
	snapshot, ok, err := uc.reader.GetStudentAppAITutorResultArchiveSnapshot(
		ctx,
		normalized.ArchiveItemID,
		normalized.StudentID,
	)
	if err != nil {
		return domain.StudentAppAITutorResultArchiveCard{}, err
	}
	if !ok {
		return domain.StudentAppAITutorResultArchiveCard{}, domain.ErrNotFound
	}
	return domain.BuildStudentAppAITutorResultArchiveCard(normalized, item, snapshot)
}
