package usecase

import (
	"context"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type AITutorWorkerStudyPacketInputRepository interface {
	GetTutoringAnalysisRequestByID(ctx context.Context, id string) (domain.TutoringAnalysisRequest, bool, error)
	StudentAppArchiveItemStudyPacketReader
	StudentAppAITutorResultArchiveReader
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
	if domain.TutoringAnalysisRequestLearningActionSource(request) == domain.StudentAppAITutorLearningActionSourceResultArchive {
		return uc.readResultArchiveInput(ctx, normalized, request, now)
	}
	return uc.readPublishedStudyPacketInput(ctx, normalized, request, now)
}

func (uc *ReadAITutorWorkerStudyPacketInput) readPublishedStudyPacketInput(
	ctx context.Context,
	normalized domain.NormalizedReadAITutorWorkerStudyPacketInputInput,
	request domain.TutoringAnalysisRequest,
	now time.Time,
) (domain.AITutorWorkerStudyPacketInput, error) {
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
	readInput := domain.BuildAITutorWorkerStudyPacketStudentReadInput(request)
	packet, err := domain.BuildStudentAppArchiveItemStudyPacket(readInput, item, preview)
	if err != nil {
		return domain.AITutorWorkerStudyPacketInput{}, err
	}
	return domain.BuildAITutorWorkerStudyPacketInput(normalized, request, packet, now)
}

func (uc *ReadAITutorWorkerStudyPacketInput) readResultArchiveInput(
	ctx context.Context,
	normalized domain.NormalizedReadAITutorWorkerStudyPacketInputInput,
	request domain.TutoringAnalysisRequest,
	now time.Time,
) (domain.AITutorWorkerStudyPacketInput, error) {
	item, ok, err := uc.repository.GetByID(ctx, request.ArchiveItemID)
	if err != nil {
		return domain.AITutorWorkerStudyPacketInput{}, err
	}
	if !ok {
		return domain.AITutorWorkerStudyPacketInput{}, domain.ErrNotFound
	}
	snapshot, ok, err := uc.repository.GetStudentAppAITutorResultArchiveSnapshot(
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
	readInput := domain.BuildAITutorWorkerStudyPacketStudentReadInput(request)
	card, err := domain.BuildStudentAppAITutorResultArchiveCard(readInput, item, snapshot)
	if err != nil {
		return domain.AITutorWorkerStudyPacketInput{}, err
	}
	rendered, err := domain.BuildStudentAppAITutorResultArchiveRenderEnvelope(card)
	if err != nil {
		return domain.AITutorWorkerStudyPacketInput{}, err
	}
	return domain.BuildAITutorWorkerResultArchiveInput(normalized, request, rendered, now)
}
