package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type ReadStudentAppAITutorResultArchiveLearningActions struct {
	renderer StudentAppAITutorResultArchiveRenderer
}

func NewReadStudentAppAITutorResultArchiveLearningActions(
	renderer StudentAppAITutorResultArchiveRenderer,
) *ReadStudentAppAITutorResultArchiveLearningActions {
	return &ReadStudentAppAITutorResultArchiveLearningActions{renderer: renderer}
}

func (uc *ReadStudentAppAITutorResultArchiveLearningActions) Execute(
	ctx context.Context,
	input domain.ReadStudentAppArchiveItemInput,
) (domain.StudentAppAITutorResultArchiveLearningActions, error) {
	normalized, err := domain.NormalizeReadStudentAppArchiveItemInput(input)
	if err != nil {
		return domain.StudentAppAITutorResultArchiveLearningActions{}, err
	}
	if err := domain.AuthorizeCreateStudentAppAITutorRequest(normalized.Principal); err != nil {
		return domain.StudentAppAITutorResultArchiveLearningActions{}, err
	}
	rendered, err := uc.renderer.Execute(ctx, input)
	if err != nil {
		return domain.StudentAppAITutorResultArchiveLearningActions{}, err
	}
	return domain.BuildStudentAppAITutorResultArchiveLearningActions(normalized, rendered)
}
