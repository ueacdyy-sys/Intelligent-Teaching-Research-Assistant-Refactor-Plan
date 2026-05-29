package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type TutoringAnalysisRepository interface {
	GetByID(ctx context.Context, id string) (domain.ArchiveItem, bool, error)
	CreateTutoringAnalysisRequest(ctx context.Context, request domain.TutoringAnalysisRequest) error
}

type CreateTutoringAnalysisRequest struct {
	repository TutoringAnalysisRepository
	ids        IDGenerator
	clock      Clock
}

func NewCreateTutoringAnalysisRequest(
	repository TutoringAnalysisRepository,
	ids IDGenerator,
	clock Clock,
) *CreateTutoringAnalysisRequest {
	return &CreateTutoringAnalysisRequest{
		repository: repository,
		ids:        ids,
		clock:      clock,
	}
}

func (uc *CreateTutoringAnalysisRequest) Execute(
	ctx context.Context,
	input domain.CreateTutoringAnalysisRequestInput,
) (domain.TutoringAnalysisRequest, error) {
	archiveItemID, err := normalizeArchiveItemID(input.ArchiveItemID)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}
	archiveItem, ok, err := uc.repository.GetByID(ctx, archiveItemID)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}
	if !ok {
		return domain.TutoringAnalysisRequest{}, domain.ErrNotFound
	}
	if err := domain.AuthorizeReadArchiveItem(input.Principal, archiveItem); err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}

	input.ArchiveItemID = archiveItemID
	input.SourceArchiveOwnerType = archiveItem.OwnerType
	input.SourceArchiveStudentID = archiveItem.StudentID
	input.SourceArchiveMaterial = archiveItem.MaterialType

	request, err := domain.NewTutoringAnalysisRequest(uc.ids.NewID(), input, uc.clock.Now())
	if err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}
	if err := uc.repository.CreateTutoringAnalysisRequest(ctx, request); err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}
	return request, nil
}

func normalizeArchiveItemID(value string) (string, error) {
	return domain.NormalizeArchiveItemID(value)
}
