package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type QuizSubmissionAIGradingRepository interface {
	GetByID(ctx context.Context, id string) (domain.ArchiveItem, bool, error)
	GetQuizSubmissionByID(ctx context.Context, id string) (domain.QuizSubmission, bool, error)
	CreateAIGradingRequest(ctx context.Context, request domain.AIGradingRequest) error
}

type CreateQuizSubmissionAIGradingRequest struct {
	repository QuizSubmissionAIGradingRepository
	ids        IDGenerator
	clock      Clock
}

func NewCreateQuizSubmissionAIGradingRequest(
	repository QuizSubmissionAIGradingRepository,
	ids IDGenerator,
	clock Clock,
) *CreateQuizSubmissionAIGradingRequest {
	return &CreateQuizSubmissionAIGradingRequest{
		repository: repository,
		ids:        ids,
		clock:      clock,
	}
}

func (uc *CreateQuizSubmissionAIGradingRequest) Execute(
	ctx context.Context,
	input domain.CreateQuizSubmissionAIGradingRequestInput,
) (domain.AIGradingRequest, error) {
	normalized, err := domain.NormalizeCreateQuizSubmissionAIGradingRequestInput(input)
	if err != nil {
		return domain.AIGradingRequest{}, err
	}

	quizItem, ok, err := uc.repository.GetByID(ctx, normalized.QuizArchiveItemID)
	if err != nil {
		return domain.AIGradingRequest{}, err
	}
	if !ok {
		return domain.AIGradingRequest{}, domain.ErrNotFound
	}
	submission, ok, err := uc.repository.GetQuizSubmissionByID(ctx, normalized.SubmissionID)
	if err != nil {
		return domain.AIGradingRequest{}, err
	}
	if !ok {
		return domain.AIGradingRequest{}, domain.ErrNotFound
	}
	if err := domain.AuthorizeCreateQuizSubmissionAIGradingRequest(normalized.Principal, quizItem, submission); err != nil {
		return domain.AIGradingRequest{}, err
	}

	request, err := domain.NewAIGradingRequest(uc.ids.NewID(), domain.CreateAIGradingRequestInput{
		Principal:               normalized.Principal,
		ArchiveItemID:           normalized.QuizArchiveItemID,
		GradingInstructions:     normalized.GradingInstructions,
		RubricRef:               normalized.RubricRef,
		SourceArchiveOwnerType:  quizItem.OwnerType,
		SourceArchiveStudentID:  submission.StudentID,
		SourceArchiveContentRef: quizItem.ContentRef,
		SourceQuizSubmissionID:  submission.ID,
		SourceAnswerRef:         submission.AnswerRef,
		SourceArchiveMaterial:   quizItem.MaterialType,
		SourceArchiveOCRStatus:  quizItem.OCRStatus,
		SourceAnalysisIntents:   quizItem.AnalysisIntents,
	}, uc.clock.Now())
	if err != nil {
		return domain.AIGradingRequest{}, err
	}
	if err := uc.repository.CreateAIGradingRequest(ctx, request); err != nil {
		return domain.AIGradingRequest{}, err
	}
	return request, nil
}
