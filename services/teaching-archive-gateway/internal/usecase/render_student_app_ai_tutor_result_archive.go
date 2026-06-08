package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type StudentAppAITutorResultArchiveCardReader interface {
	Execute(
		ctx context.Context,
		input domain.ReadStudentAppArchiveItemInput,
	) (domain.StudentAppAITutorResultArchiveCard, error)
}

type RenderStudentAppAITutorResultArchive struct {
	reader StudentAppAITutorResultArchiveCardReader
}

func NewRenderStudentAppAITutorResultArchive(
	reader StudentAppAITutorResultArchiveCardReader,
) *RenderStudentAppAITutorResultArchive {
	return &RenderStudentAppAITutorResultArchive{reader: reader}
}

func (uc *RenderStudentAppAITutorResultArchive) Execute(
	ctx context.Context,
	input domain.ReadStudentAppArchiveItemInput,
) (domain.StudentAppAITutorResultArchiveRenderEnvelope, error) {
	card, err := uc.reader.Execute(ctx, input)
	if err != nil {
		return domain.StudentAppAITutorResultArchiveRenderEnvelope{}, err
	}
	return domain.BuildStudentAppAITutorResultArchiveRenderEnvelope(card)
}
