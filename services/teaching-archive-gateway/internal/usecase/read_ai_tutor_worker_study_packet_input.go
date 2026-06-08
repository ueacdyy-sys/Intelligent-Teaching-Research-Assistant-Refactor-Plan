package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type AITutorWorkerStudyPacketInputRepository interface {
	GetTutoringAnalysisRequestByID(ctx context.Context, id string) (domain.TutoringAnalysisRequest, bool, error)
	StudentAppArchiveItemStudyPacketReader
}

type ReadAITutorWorkerStudyPacketInput struct {
	repository AITutorWorkerStudyPacketInputRepository
	clock      Clock
}

func NewReadAITutorWorkerStudyPacketInput(
	repository AITutorWorkerStudyPacketInputRepository,
	clock Clock,
) *ReadAITutorWorkerStudyPacketInput {
	return &ReadAITutorWorkerStudyPacketInput{
		repository: repository,
		clock:      clock,
	}
}

func (uc *ReadAITutorWorkerStudyPacketInput) Execute(
	ctx context.Context,
	input domain.ReadAITutorWorkerStudyPacketInputInput,
) (domain.AITutorWorkerStudyPacketInput, error) {
	normalized, err := domain.NormalizeReadAITutorWorkerStudyPacketInputInput(input)
	if err != nil {
		return domain.AITutorWorkerStudyPacketInput{}, err
	}
	request, ok, err := uc.repository.GetTutoringAnalysisRequestByID(ctx, normalized.RequestID)
	if err != nil {
		return domain.AITutorWorkerStudyPacketInput{}, err
	}
	if !ok {
		return domain.AITutorWorkerStudyPacketInput{}, domain.ErrNotFound
	}
	now := uc.clock.Now()
	if err := domain.ValidateAITutorWorkerStudyPacketRequest(normalized, request, now); err != nil {
		return domain.AITutorWorkerStudyPacketInput{}, err
	}
	item, ok, err := uc.repository.GetPublishedForStudentApp(ctx, request.ArchiveItemID, request.SourceArchiveStudentID)
	if err != nil {
		return domain.AITutorWorkerStudyPacketInput{}, err
	}
	if !ok {
		return domain.AITutorWorkerStudyPacketInput{}, domain.ErrNotFound
	}
	preview, ok, err := uc.repository.GetPublishedContentPreviewForStudentApp(
		ctx,
		request.ArchiveItemID,
		request.SourceArchiveStudentID,
	)
	if err != nil {
		return domain.AITutorWorkerStudyPacketInput{}, err
	}
	if !ok {
		return domain.AITutorWorkerStudyPacketInput{}, domain.ErrNotFound
	}
	readInput := domain.NormalizedReadStudentAppArchiveItemInput{
		Principal:     normalized.Principal,
		ArchiveItemID: request.ArchiveItemID,
		StudentID:     request.SourceArchiveStudentID,
	}
	packet, err := domain.BuildStudentAppArchiveItemStudyPacket(readInput, item, preview)
	if err != nil {
		return domain.AITutorWorkerStudyPacketInput{}, err
	}
	return domain.BuildAITutorWorkerStudyPacketInput(normalized, request, packet, now)
}
