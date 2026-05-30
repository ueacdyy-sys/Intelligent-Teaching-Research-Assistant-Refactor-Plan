package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type AIGradingRepository interface {
	GetByID(ctx context.Context, id string) (domain.ArchiveItem, bool, error)
	CreateAIGradingRequest(ctx context.Context, request domain.AIGradingRequest) error
}

type CreateAIGradingRequest struct {
	repository AIGradingRepository
	ids        IDGenerator
	clock      Clock
}

func NewCreateAIGradingRequest(
	repository AIGradingRepository,
	ids IDGenerator,
	clock Clock,
) *CreateAIGradingRequest {
	return &CreateAIGradingRequest{
		repository: repository,
		ids:        ids,
		clock:      clock,
	}
}

func (uc *CreateAIGradingRequest) Execute(
	ctx context.Context,
	input domain.CreateAIGradingRequestInput,
) (domain.AIGradingRequest, error) {
	archiveItemID, err := normalizeArchiveItemID(input.ArchiveItemID)
	if err != nil {
		return domain.AIGradingRequest{}, err
	}
	archiveItem, ok, err := uc.repository.GetByID(ctx, archiveItemID)
	if err != nil {
		return domain.AIGradingRequest{}, err
	}
	if !ok {
		return domain.AIGradingRequest{}, domain.ErrNotFound
	}
	if err := domain.AuthorizeReadArchiveItem(input.Principal, archiveItem); err != nil {
		return domain.AIGradingRequest{}, err
	}
	if err := domain.AuthorizeCreateAIGradingRequest(input.Principal, archiveItem); err != nil {
		return domain.AIGradingRequest{}, err
	}

	input.ArchiveItemID = archiveItemID
	input.SourceArchiveOwnerType = archiveItem.OwnerType
	input.SourceArchiveStudentID = archiveItem.StudentID
	input.SourceArchiveContentRef = archiveItem.ContentRef
	input.SourceArchiveMaterial = archiveItem.MaterialType
	input.SourceArchiveOCRStatus = archiveItem.OCRStatus
	input.SourceAnalysisIntents = archiveItem.AnalysisIntents

	request, err := domain.NewAIGradingRequest(uc.ids.NewID(), input, uc.clock.Now())
	if err != nil {
		return domain.AIGradingRequest{}, err
	}
	if err := uc.repository.CreateAIGradingRequest(ctx, request); err != nil {
		return domain.AIGradingRequest{}, err
	}
	return request, nil
}
