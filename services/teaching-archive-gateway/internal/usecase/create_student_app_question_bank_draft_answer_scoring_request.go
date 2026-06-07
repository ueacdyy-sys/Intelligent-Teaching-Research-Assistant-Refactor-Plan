package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type StudentAppQuestionBankDraftAnswerScoringRequestRepository interface {
	GetQuestionBankDraftAnswerSubmissionForStudent(
		ctx context.Context,
		submissionID string,
		studentID string,
	) (domain.QuestionBankDraftAnswerSubmission, bool, error)
	GetQuestionBankDraftContentForStudent(
		ctx context.Context,
		draftRef string,
		studentID string,
	) (domain.QuestionBankDraftContent, bool, error)
	CreateAIGradingRequest(ctx context.Context, request domain.AIGradingRequest) error
}

type CreateStudentAppQuestionBankDraftAnswerScoringRequest struct {
	repository StudentAppQuestionBankDraftAnswerScoringRequestRepository
	ids        IDGenerator
	clock      Clock
}

func NewCreateStudentAppQuestionBankDraftAnswerScoringRequest(
	repository StudentAppQuestionBankDraftAnswerScoringRequestRepository,
	ids IDGenerator,
	clock Clock,
) *CreateStudentAppQuestionBankDraftAnswerScoringRequest {
	return &CreateStudentAppQuestionBankDraftAnswerScoringRequest{
		repository: repository,
		ids:        ids,
		clock:      clock,
	}
}

func (uc *CreateStudentAppQuestionBankDraftAnswerScoringRequest) Execute(
	ctx context.Context,
	input domain.CreateStudentAppQuestionBankDraftAnswerScoringRequestInput,
) (domain.AIGradingRequest, error) {
	normalized, err := domain.NormalizeCreateStudentAppQuestionBankDraftAnswerScoringRequestInput(input)
	if err != nil {
		return domain.AIGradingRequest{}, err
	}
	submission, ok, err := uc.repository.GetQuestionBankDraftAnswerSubmissionForStudent(
		ctx,
		normalized.SubmissionID,
		normalized.StudentID,
	)
	if err != nil {
		return domain.AIGradingRequest{}, err
	}
	if !ok {
		return domain.AIGradingRequest{}, domain.ErrNotFound
	}
	content, ok, err := uc.repository.GetQuestionBankDraftContentForStudent(
		ctx,
		submission.QuestionBankDraftRef,
		normalized.StudentID,
	)
	if err != nil {
		return domain.AIGradingRequest{}, err
	}
	if !ok {
		return domain.AIGradingRequest{}, domain.ErrNotFound
	}
	if err := domain.ValidateQuestionBankDraftAnswerScoringSource(normalized, submission, content); err != nil {
		return domain.AIGradingRequest{}, err
	}

	request, err := domain.NewAIGradingRequest(uc.ids.NewID(), domain.CreateAIGradingRequestInput{
		Principal:                            normalized.Principal,
		ArchiveItemID:                        submission.ArchiveItemID,
		GradingInstructions:                  normalized.GradingInstructions,
		RubricRef:                            normalized.RubricRef,
		SourceArchiveOwnerType:               domain.OwnerTypeStudent,
		SourceArchiveStudentID:               submission.StudentID,
		SourceArchiveContentRef:              submission.QuestionBankDraftRef,
		SourceQuestionBankDraftRef:           submission.QuestionBankDraftRef,
		SourceQuestionBankAnswerSubmissionID: submission.ID,
		SourceArchiveMaterial:                content.SourceArchiveMaterial,
		SourceArchiveOCRStatus:               domain.OCRStatusNotRequired,
		SourceAnalysisIntents:                []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
	}, uc.clock.Now())
	if err != nil {
		return domain.AIGradingRequest{}, err
	}
	if err := uc.repository.CreateAIGradingRequest(ctx, request); err != nil {
		return domain.AIGradingRequest{}, err
	}
	return request, nil
}
