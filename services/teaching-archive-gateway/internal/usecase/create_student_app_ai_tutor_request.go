package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type CreateStudentAppAITutorRequest struct {
	repository TutoringAnalysisRepository
	ids        IDGenerator
	clock      Clock
}

func NewCreateStudentAppAITutorRequest(
	repository TutoringAnalysisRepository,
	ids IDGenerator,
	clock Clock,
) *CreateStudentAppAITutorRequest {
	return &CreateStudentAppAITutorRequest{
		repository: repository,
		ids:        ids,
		clock:      clock,
	}
}

func (uc *CreateStudentAppAITutorRequest) Execute(
	ctx context.Context,
	input domain.CreateStudentAppAITutorRequestInput,
) (domain.TutoringAnalysisRequest, error) {
	normalized, err := domain.NormalizeCreateStudentAppAITutorRequestInput(input)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}

	archiveItem, ok, err := uc.repository.GetByID(ctx, normalized.ArchiveItemID)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}
	if !ok {
		return domain.TutoringAnalysisRequest{}, domain.ErrNotFound
	}
	if archiveItem.OwnerType != domain.OwnerTypeStudent {
		return domain.TutoringAnalysisRequest{}, domain.ErrForbidden
	}
	if err := domain.AuthorizeReadArchiveItem(normalized.Principal, archiveItem); err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}

	request, err := domain.NewTutoringAnalysisRequest(
		uc.ids.NewID(),
		domain.CreateTutoringAnalysisRequestInput{
			Principal:              normalized.Principal,
			ArchiveItemID:          normalized.ArchiveItemID,
			AnalysisGoal:           normalized.AnalysisGoal,
			QuestionBankIntent:     normalized.QuestionBankIntent,
			SourceArchiveOwnerType: archiveItem.OwnerType,
			SourceArchiveStudentID: archiveItem.StudentID,
			SourceArchiveMaterial:  archiveItem.MaterialType,
		},
		uc.clock.Now(),
	)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}
	if err := uc.repository.CreateTutoringAnalysisRequest(ctx, request); err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}
	return request, nil
}
