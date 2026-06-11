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
	StudentAppAITutorResultArchiveSnapshotReader
	QuestionBankDraftAnswerFeedbackSnapshotByArchiveItemReader
	GetQuestionBankDraftAnswerSubmissionForStudent(
		ctx context.Context,
		submissionID string,
		studentID string,
	) (domain.QuestionBankDraftAnswerSubmission, bool, error)
	FindPendingStudentAppAITutorResultArchiveFollowUpRequest(
		ctx context.Context,
		query domain.StudentAppAITutorResultArchiveFollowUpPendingRequestQuery,
	) (domain.TutoringAnalysisRequest, bool, error)
}

type QuestionBankDraftAnswerFeedbackSnapshotByArchiveItemReader interface {
	GetQuestionBankDraftAnswerFeedbackArchiveSnapshotByFeedbackArchiveItemForStudent(
		ctx context.Context,
		feedbackArchiveItemID string,
		studentID string,
	) (domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot, bool, error)
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
			LearningActionSource:   tutoringRequestLearningActionSource(normalized.LearningActionSource),
			FollowUpDepth:          normalized.LearningActionSource.FollowUpDepth,
			SourceArchiveOwnerType: archiveItem.OwnerType,
			SourceArchiveStudentID: archiveItem.StudentID,
			SourceArchiveMaterial:  archiveItem.MaterialType,
		},
		uc.clock.Now(),
	)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}
	if existing, ok, err := uc.findPendingResultArchiveFollowUp(ctx, request); err != nil {
		return domain.TutoringAnalysisRequest{}, err
	} else if ok {
		return existing, nil
	}
	if err := uc.repository.CreateTutoringAnalysisRequest(ctx, request); err != nil {
		if existing, ok, findErr := uc.findPendingResultArchiveFollowUp(ctx, request); findErr == nil && ok {
			return existing, nil
		}
		return domain.TutoringAnalysisRequest{}, err
	}
	return request, nil
}

func (uc *CreateStudentAppAITutorRequest) findPendingResultArchiveFollowUp(
	ctx context.Context,
	request domain.TutoringAnalysisRequest,
) (domain.TutoringAnalysisRequest, bool, error) {
	if domain.TutoringAnalysisRequestLearningActionSource(request) != domain.StudentAppAITutorLearningActionSourceResultArchive {
		return domain.TutoringAnalysisRequest{}, false, nil
	}
	query, err := domain.BuildStudentAppAITutorResultArchiveFollowUpPendingRequestQuery(request)
	if err != nil {
		return domain.TutoringAnalysisRequest{}, false, err
	}
	return uc.repository.FindPendingStudentAppAITutorResultArchiveFollowUpRequest(ctx, query)
}

func tutoringRequestLearningActionSource(
	source domain.StudentAppAITutorLearningActionSource,
) domain.StudentAppAITutorLearningActionSourceType {
	if source.SourceType == "" {
		return domain.StudentAppAITutorLearningActionSourcePublishedStudyPacket
	}
	return source.SourceType
}

func (uc *CreateStudentAppAITutorRequest) readArchiveItemForStudentAppTutorRequest(
	ctx context.Context,
	input domain.NormalizedCreateStudentAppAITutorRequestInput,
) (domain.ArchiveItem, error) {
	if !input.LearningActionSource.IsZero() {
		switch input.LearningActionSource.SourceType {
		case domain.StudentAppAITutorLearningActionSourceResultArchive:
			return uc.readAITutorResultArchiveActionSource(ctx, input)
		case domain.StudentAppAITutorLearningActionSourceQuestionBankFeedback:
			return uc.readQuestionBankDraftAnswerFeedbackActionSource(ctx, input)
		default:
			return uc.readPublishedStudyPacketActionSource(ctx, input)
		}
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

func (uc *CreateStudentAppAITutorRequest) readAITutorResultArchiveActionSource(
	ctx context.Context,
	input domain.NormalizedCreateStudentAppAITutorRequestInput,
) (domain.ArchiveItem, error) {
	archiveItem, ok, err := uc.repository.GetByID(ctx, input.ArchiveItemID)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	if !ok {
		return domain.ArchiveItem{}, domain.ErrNotFound
	}
	snapshot, ok, err := uc.repository.GetStudentAppAITutorResultArchiveSnapshot(
		ctx,
		input.ArchiveItemID,
		input.StudentID,
	)
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
	card, err := domain.BuildStudentAppAITutorResultArchiveCard(readInput, archiveItem, snapshot)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	rendered, err := domain.BuildStudentAppAITutorResultArchiveRenderEnvelope(card)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	actions, err := domain.BuildStudentAppAITutorResultArchiveLearningActions(readInput, rendered)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	if actions.Status != input.LearningActionSource.ResultArchiveStatus ||
		actions.RenderFormat != input.LearningActionSource.RenderFormat {
		return domain.ArchiveItem{}, domain.ErrForbidden
	}
	for _, action := range actions.Actions {
		if action.ActionType == input.LearningActionSource.ActionType &&
			action.QuestionBankIntent == input.QuestionBankIntent &&
			action.TargetEndpoint == "/v1/student-app/ai-tutor-requests" &&
			action.Method == "POST" &&
			action.SourceType == domain.StudentAppAITutorLearningActionSourceResultArchive &&
			action.FollowUpDepth == input.LearningActionSource.FollowUpDepth {
			return archiveItem, nil
		}
	}
	return domain.ArchiveItem{}, domain.ErrForbidden
}

func (uc *CreateStudentAppAITutorRequest) readQuestionBankDraftAnswerFeedbackActionSource(
	ctx context.Context,
	input domain.NormalizedCreateStudentAppAITutorRequestInput,
) (domain.ArchiveItem, error) {
	archiveItem, ok, err := uc.repository.GetByID(ctx, input.ArchiveItemID)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	if !ok {
		return domain.ArchiveItem{}, domain.ErrNotFound
	}
	source := input.LearningActionSource
	snapshot, ok, err := uc.repository.GetQuestionBankDraftAnswerFeedbackArchiveSnapshotByFeedbackArchiveItemForStudent(
		ctx,
		input.ArchiveItemID,
		input.StudentID,
	)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	if !ok {
		return domain.ArchiveItem{}, domain.ErrNotFound
	}
	if snapshot.SubmissionID != source.SubmissionID {
		return domain.ArchiveItem{}, domain.ErrForbidden
	}
	submission, ok, err := uc.repository.GetQuestionBankDraftAnswerSubmissionForStudent(
		ctx,
		source.SubmissionID,
		input.StudentID,
	)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	if !ok {
		return domain.ArchiveItem{}, domain.ErrNotFound
	}
	readInput := domain.NormalizedReadStudentAppQuestionBankDraftAnswerFeedbackInput{
		Principal:    input.Principal,
		SubmissionID: source.SubmissionID,
		StudentID:    input.StudentID,
	}
	card, err := domain.BuildStudentAppQuestionBankDraftAnswerFeedbackCard(readInput, submission, archiveItem, snapshot)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	rendered, err := domain.BuildQuestionBankDraftAnswerFeedbackRenderEnvelope(card)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	actions, err := domain.BuildQuestionBankDraftAnswerFeedbackLearningActions(readInput, rendered)
	if err != nil {
		return domain.ArchiveItem{}, err
	}
	if actions.Status != source.FeedbackStatus || actions.RenderFormat != source.FeedbackRenderFormat {
		return domain.ArchiveItem{}, domain.ErrForbidden
	}
	for _, action := range actions.Actions {
		if action.ActionType == source.ActionType &&
			action.QuestionBankIntent == input.QuestionBankIntent &&
			action.TargetEndpoint == "/v1/student-app/ai-tutor-requests" &&
			action.Method == "POST" &&
			action.SourceType == domain.StudentAppAITutorLearningActionSourceQuestionBankFeedback {
			return archiveItem, nil
		}
	}
	return domain.ArchiveItem{}, domain.ErrForbidden
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
