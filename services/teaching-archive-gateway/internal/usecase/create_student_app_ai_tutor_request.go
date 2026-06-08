package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type CreateStudentAppAITutorRequest struct {
	repository StudentAppAITutorRequestRepository
	ids        IDGenerator
	clock      Clock
}

type StudentAppAITutorRequestRepository interface {
	TutoringAnalysisRepository
	StudentAppArchiveItemStudyPacketReader
}

func NewCreateStudentAppAITutorRequest(
	repository StudentAppAITutorRequestRepository,
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

	archiveItem, err := uc.readArchiveItemForStudentAppTutorRequest(ctx, normalized)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, err
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

func (uc *CreateStudentAppAITutorRequest) readArchiveItemForStudentAppTutorRequest(
	ctx context.Context,
	input domain.NormalizedCreateStudentAppAITutorRequestInput,
) (domain.ArchiveItem, error) {
	if !input.LearningActionSource.IsZero() {
		return uc.readPublishedStudyPacketActionSource(ctx, input)
	}
	archiveItem, ok, err := uc.repository.GetByID(ctx, input.ArchiveItemID)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	if !ok {
		return domain.ArchiveItem{}, domain.ErrNotFound
	}
	return archiveItem, nil
}

func (uc *CreateStudentAppAITutorRequest) readPublishedStudyPacketActionSource(
	ctx context.Context,
	input domain.NormalizedCreateStudentAppAITutorRequestInput,
) (domain.ArchiveItem, error) {
	archiveItem, ok, err := uc.repository.GetPublishedForStudentApp(ctx, input.ArchiveItemID, input.StudentID)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	if !ok {
		return domain.ArchiveItem{}, domain.ErrNotFound
	}
	preview, ok, err := uc.repository.GetPublishedContentPreviewForStudentApp(ctx, input.ArchiveItemID, input.StudentID)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	if !ok {
		return domain.ArchiveItem{}, domain.ErrNotFound
	}
	readInput := domain.NormalizedReadStudentAppArchiveItemInput{
		Principal:     input.Principal,
		ArchiveItemID: input.ArchiveItemID,
		StudentID:     input.StudentID,
	}
	packet, err := domain.BuildStudentAppArchiveItemStudyPacket(readInput, archiveItem, preview)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	actions, err := domain.BuildStudentAppArchiveItemLearningActions(readInput, packet)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	if actions.PacketStatus != input.LearningActionSource.PacketStatus {
		return domain.ArchiveItem{}, domain.ErrForbidden
	}
	for _, action := range actions.Actions {
		if action.ActionType == input.LearningActionSource.ActionType &&
			action.QuestionBankIntent == input.QuestionBankIntent &&
			action.TargetEndpoint == "/v1/student-app/ai-tutor-requests" &&
			action.Method == "POST" {
			return archiveItem, nil
		}
	}
	return domain.ArchiveItem{}, domain.ErrForbidden
}
