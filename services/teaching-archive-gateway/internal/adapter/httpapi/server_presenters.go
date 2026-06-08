package httpapi

import (
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func toListResponse(page domain.ArchiveItemPage) archiveItemListResponse {
	items := make([]archiveItemResponse, 0, len(page.Items))
	for _, item := range page.Items {
		items = append(items, toResponse(item))
	}
	return archiveItemListResponse{
		Data: items,
		PageInfo: pageInfoResponse{
			PageSize:   page.PageInfo.PageSize,
			HasMore:    page.PageInfo.HasMore,
			NextCursor: optionalString(page.PageInfo.NextCursor),
		},
	}
}

func toResponse(item domain.ArchiveItem) archiveItemResponse {
	return archiveItemResponse{
		ID:              item.ID,
		OwnerType:       item.OwnerType,
		StudentID:       optionalString(item.StudentID),
		MaterialType:    item.MaterialType,
		Title:           item.Title,
		Source:          item.Source,
		ContentRef:      item.ContentRef,
		Tags:            item.Tags,
		AnalysisIntents: item.AnalysisIntents,
		OCRStatus:       item.OCRStatus,
		CreatedAt:       formatTime(item.CreatedAt),
	}
}

func toStudentAppArchiveItemMetadataResponse(
	item domain.ArchiveItem,
) studentAppArchiveItemMetadataResponse {
	return studentAppArchiveItemMetadataResponse{
		ID:              item.ID,
		OwnerType:       item.OwnerType,
		StudentID:       item.StudentID,
		MaterialType:    item.MaterialType,
		Title:           item.Title,
		Source:          item.Source,
		Tags:            item.Tags,
		AnalysisIntents: item.AnalysisIntents,
		OCRStatus:       item.OCRStatus,
		CreatedAt:       formatTime(item.CreatedAt),
	}
}

func toStudentAppArchiveItemContentPreviewResponse(
	preview domain.PublishedArchiveMaterialContentPreview,
) studentAppArchiveItemContentPreviewResponse {
	sections := make([]studentAppArchiveItemContentPreviewSection, 0, len(preview.Sections))
	for _, section := range preview.Sections {
		sections = append(sections, studentAppArchiveItemContentPreviewSection{
			ID:       section.ID,
			Title:    section.Title,
			Text:     section.Text,
			PageHint: section.PageHint,
		})
	}
	return studentAppArchiveItemContentPreviewResponse{
		ArchiveItemID: preview.ArchiveItemID,
		MaterialType:  preview.MaterialType,
		Title:         preview.Title,
		PreviewStatus: preview.Status,
		Sections:      sections,
		CreatedAt:     formatTime(preview.CreatedAt),
		UpdatedAt:     formatTime(preview.UpdatedAt),
	}
}

func toStudentAppArchiveItemContentPreviewRenderResponse(
	rendered domain.PublishedArchiveMaterialContentPreviewRenderEnvelope,
) studentAppArchiveItemContentPreviewRenderResponse {
	blocks := make([]studentAppArchiveItemContentPreviewBlock, 0, len(rendered.Blocks))
	for _, block := range rendered.Blocks {
		blocks = append(blocks, studentAppArchiveItemContentPreviewBlock{
			BlockID:   block.BlockID,
			BlockType: block.BlockType,
			SectionID: block.SectionID,
			Title:     block.Title,
			Text:      block.Text,
			PageHint:  block.PageHint,
		})
	}
	return studentAppArchiveItemContentPreviewRenderResponse{
		ArchiveItemID: rendered.ArchiveItemID,
		MaterialType:  rendered.MaterialType,
		Title:         rendered.Title,
		PreviewStatus: rendered.PreviewStatus,
		RenderFormat:  rendered.RenderFormat,
		Blocks:        blocks,
		CreatedAt:     formatTime(rendered.CreatedAt),
		UpdatedAt:     formatTime(rendered.UpdatedAt),
	}
}

func toStudentAppArchiveItemStudyPacketResponse(
	packet domain.StudentAppArchiveItemStudyPacket,
) studentAppArchiveItemStudyPacketResponse {
	return studentAppArchiveItemStudyPacketResponse{
		PacketStatus: packet.PacketStatus,
		ArchiveItem: studentAppArchiveItemStudyPacketMetadata{
			ID:              packet.ArchiveItem.ID,
			OwnerType:       packet.ArchiveItem.OwnerType,
			MaterialType:    packet.ArchiveItem.MaterialType,
			Title:           packet.ArchiveItem.Title,
			Source:          packet.ArchiveItem.Source,
			Tags:            packet.ArchiveItem.Tags,
			AnalysisIntents: packet.ArchiveItem.AnalysisIntents,
			OCRStatus:       packet.ArchiveItem.OCRStatus,
			CreatedAt:       formatTime(packet.ArchiveItem.CreatedAt),
		},
		ContentPreview: toStudentAppArchiveItemContentPreviewRenderResponse(packet.ContentPreview),
	}
}

func toStudentAppArchiveItemLearningActionsResponse(
	actions domain.StudentAppArchiveItemLearningActions,
) studentAppArchiveItemLearningActionsResponse {
	response := studentAppArchiveItemLearningActionsResponse{
		ArchiveItemID: actions.ArchiveItemID,
		MaterialType:  actions.MaterialType,
		PacketStatus:  actions.PacketStatus,
		Actions:       make([]studentAppArchiveItemLearningActionResponse, 0, len(actions.Actions)),
	}
	for _, action := range actions.Actions {
		response.Actions = append(response.Actions, studentAppArchiveItemLearningActionResponse{
			ActionType:           action.ActionType,
			State:                action.State,
			TargetEndpoint:       action.TargetEndpoint,
			Method:               action.Method,
			QuestionBankIntent:   action.QuestionBankIntent,
			RequiresTutorRequest: action.RequiresTutorRequest,
		})
	}
	return response
}

func toStudentAppAITutorResultArchiveCardResponse(
	card domain.StudentAppAITutorResultArchiveCard,
) studentAppAITutorResultArchiveCardResponse {
	sections := make([]studentAppAITutorResultArchiveGuidanceSection, 0, len(card.GuidanceSections))
	for _, section := range card.GuidanceSections {
		sections = append(sections, studentAppAITutorResultArchiveGuidanceSection{
			SectionID:       section.SectionID,
			Title:           section.Title,
			Text:            section.Text,
			SourceBlockRefs: section.SourceBlockRefs,
		})
	}
	return studentAppAITutorResultArchiveCardResponse{
		ArchiveItemID:        card.ArchiveItemID,
		Status:               card.Status,
		MaterialType:         card.MaterialType,
		Title:                card.Title,
		Source:               card.Source,
		Tags:                 card.Tags,
		AnalysisIntents:      card.AnalysisIntents,
		OCRStatus:            card.OCRStatus,
		Summary:              card.Summary,
		GuidanceSections:     sections,
		GuidanceSectionsHash: card.GuidanceSectionsHash,
		SafetyLabels:         card.SafetyLabels,
		CreatedAt:            formatTime(card.CreatedAt),
	}
}

func toAcceptedArchiveItemResponse(result usecase.CreateArchiveItemResult) archiveItemAcceptedResponse {
	return archiveItemAcceptedResponse{
		archiveItemResponse: toResponse(result.Item),
		Command: commandResponse{
			ID:         result.Persistence.CommandID,
			Status:     string(result.Persistence.Status),
			ResourceID: result.Item.ID,
		},
	}
}

func toQuizSubmissionResponse(submission domain.QuizSubmission) quizSubmissionResponse {
	return quizSubmissionResponse{
		ID:                     submission.ID,
		QuizArchiveItemID:      submission.QuizArchiveItemID,
		StudentID:              submission.StudentID,
		SubmittedByPrincipalID: submission.SubmittedByPrincipalID,
		AnswerRef:              submission.AnswerRef,
		Status:                 submission.Status,
		SubmittedAt:            formatTime(submission.SubmittedAt),
	}
}

func toAcceptedQuizSubmissionResponse(result usecase.CreateQuizSubmissionResult) quizSubmissionAcceptedResponse {
	return quizSubmissionAcceptedResponse{
		quizSubmissionResponse: toQuizSubmissionResponse(result.Submission),
		Command: commandResponse{
			ID:         result.Persistence.CommandID,
			Status:     string(result.Persistence.Status),
			ResourceID: result.Submission.ID,
		},
	}
}

func toTeachingQuizDraftIntentResponse(
	intent domain.TeachingQuizDraftIntent,
) teachingQuizDraftIntentResponse {
	return teachingQuizDraftIntentResponse{
		ID:                     intent.ID,
		RequestedByPrincipalID: intent.RequestedByPrincipalID,
		SessionID:              intent.SessionID,
		Title:                  intent.Title,
		SourceMaterialRefs:     intent.SourceMaterialRefs,
		LearningObjectives:     intent.LearningObjectives,
		QuestionCount:          intent.QuestionCount,
		Difficulty:             intent.Difficulty,
		Status:                 intent.Status,
		ApprovalRequired:       intent.ApprovalRequired,
		EventType:              intent.EventType,
		SharedContextRef:       intent.SharedContextRef,
		GuardrailResultRef:     intent.GuardrailResultRef,
		RouteDecisionRef:       intent.RouteDecisionRef,
		InputHash:              intent.InputHash,
		OutputSummary:          intent.OutputSummary,
		ApprovalArtifactRef:    intent.ApprovalArtifactRef,
		RollbackPlanRef:        intent.RollbackPlanRef,
		AuditTraceRef:          intent.AuditTraceRef,
		IdempotencyKey:         intent.IdempotencyKey,
		CreatedAt:              formatTime(intent.CreatedAt),
	}
}

func toAcceptedTeachingQuizDraftIntentResponse(
	result usecase.SubmitTeachingQuizDraftIntentResult,
) teachingQuizDraftIntentAcceptedResponse {
	return teachingQuizDraftIntentAcceptedResponse{
		teachingQuizDraftIntentResponse: toTeachingQuizDraftIntentResponse(result.Intent),
		Command: commandResponse{
			ID:         result.Persistence.CommandID,
			Status:     string(result.Persistence.Status),
			ResourceID: result.Intent.ID,
		},
	}
}

func toTeachingArchiveMaterialDraftIntentResponse(
	intent domain.TeachingArchiveMaterialDraftIntent,
) teachingArchiveMaterialDraftIntentResponse {
	return teachingArchiveMaterialDraftIntentResponse{
		ID:                     intent.ID,
		RequestedByPrincipalID: intent.RequestedByPrincipalID,
		SessionID:              intent.SessionID,
		OwnerType:              intent.OwnerType,
		StudentID:              optionalString(intent.StudentID),
		MaterialType:           intent.MaterialType,
		Title:                  intent.Title,
		Source:                 intent.Source,
		SourceRefs:             intent.SourceRefs,
		DraftArtifactRef:       intent.DraftArtifactRef,
		Tags:                   intent.Tags,
		AnalysisIntents:        intent.AnalysisIntents,
		Status:                 intent.Status,
		ApprovalRequired:       intent.ApprovalRequired,
		EventType:              intent.EventType,
		SharedContextRef:       intent.SharedContextRef,
		GuardrailResultRef:     intent.GuardrailResultRef,
		RouteDecisionRef:       intent.RouteDecisionRef,
		InputHash:              intent.InputHash,
		OutputSummary:          intent.OutputSummary,
		ApprovalArtifactRef:    intent.ApprovalArtifactRef,
		RollbackPlanRef:        intent.RollbackPlanRef,
		AuditTraceRef:          intent.AuditTraceRef,
		IdempotencyKey:         intent.IdempotencyKey,
		CreatedAt:              formatTime(intent.CreatedAt),
	}
}

func toAcceptedTeachingArchiveMaterialDraftIntentResponse(
	result usecase.SubmitTeachingArchiveMaterialDraftIntentResult,
) teachingArchiveMaterialDraftIntentAcceptedResponse {
	return teachingArchiveMaterialDraftIntentAcceptedResponse{
		teachingArchiveMaterialDraftIntentResponse: toTeachingArchiveMaterialDraftIntentResponse(result.Intent),
		Command: commandResponse{
			ID:         result.Persistence.CommandID,
			Status:     string(result.Persistence.Status),
			ResourceID: result.Intent.ID,
		},
	}
}

func toQuizSubmissionListResponse(page domain.QuizSubmissionPage) quizSubmissionListResponse {
	submissions := make([]quizSubmissionResponse, 0, len(page.Items))
	for _, submission := range page.Items {
		submissions = append(submissions, toQuizSubmissionResponse(submission))
	}
	return quizSubmissionListResponse{
		Data: submissions,
		PageInfo: pageInfoResponse{
			PageSize:   page.PageInfo.PageSize,
			HasMore:    page.PageInfo.HasMore,
			NextCursor: optionalString(page.PageInfo.NextCursor),
		},
	}
}

func toStudentAppQuestionBankDraftListResponse(
	page domain.StudentAppQuestionBankDraftPage,
) studentAppQuestionBankDraftListResponse {
	drafts := make([]studentAppQuestionBankDraftResponse, 0, len(page.Items))
	for _, draft := range page.Items {
		drafts = append(drafts, toStudentAppQuestionBankDraftResponse(draft))
	}
	return studentAppQuestionBankDraftListResponse{
		Data: drafts,
		PageInfo: pageInfoResponse{
			PageSize:   page.PageInfo.PageSize,
			HasMore:    page.PageInfo.HasMore,
			NextCursor: optionalString(page.PageInfo.NextCursor),
		},
	}
}

func toStudentAppQuestionBankDraftResponse(
	draft domain.StudentAppQuestionBankDraft,
) studentAppQuestionBankDraftResponse {
	return studentAppQuestionBankDraftResponse{
		TutoringAnalysisRequestID: draft.TutoringAnalysisRequestID,
		ArchiveItemID:             draft.ArchiveItemID,
		SourceArchiveMaterial:     draft.SourceArchiveMaterial,
		ResultSummary:             draft.ResultSummary,
		ResultRef:                 draft.ResultRef,
		QuestionBankDraftRef:      draft.QuestionBankDraftRef,
		CreatedAt:                 formatTime(draft.CreatedAt),
		CompletedAt:               formatTime(draft.CompletedAt),
	}
}

func toStudentAppQuestionBankDraftContentResponse(
	content domain.QuestionBankDraftContent,
) studentAppQuestionBankDraftContentResponse {
	items := make([]questionBankDraftItemResponse, 0, len(content.Items))
	for _, item := range content.Items {
		items = append(items, questionBankDraftItemResponse{
			ID:             item.ID,
			QuestionText:   item.QuestionText,
			LearningTarget: item.LearningTarget,
		})
	}
	return studentAppQuestionBankDraftContentResponse{
		QuestionBankDraftRef:      content.QuestionBankDraftRef,
		TutoringAnalysisRequestID: content.TutoringAnalysisRequestID,
		ArchiveItemID:             content.ArchiveItemID,
		SourceArchiveMaterial:     content.SourceArchiveMaterial,
		ResultSummary:             content.ResultSummary,
		Items:                     items,
		CreatedAt:                 formatTime(content.CreatedAt),
		UpdatedAt:                 formatTime(content.UpdatedAt),
	}
}

func toQuestionBankDraftAnswerSubmissionResponse(
	submission domain.QuestionBankDraftAnswerSubmission,
) questionBankDraftAnswerSubmissionResponse {
	return questionBankDraftAnswerSubmissionResponse{
		ID:                        submission.ID,
		QuestionBankDraftRef:      submission.QuestionBankDraftRef,
		TutoringAnalysisRequestID: submission.TutoringAnalysisRequestID,
		ArchiveItemID:             submission.ArchiveItemID,
		StudentID:                 submission.StudentID,
		SubmittedByPrincipalID:    submission.SubmittedByPrincipalID,
		Status:                    submission.Status,
		AnswerCount:               len(submission.Answers),
		SubmittedAt:               formatTime(submission.SubmittedAt),
	}
}

func toStudentAppQuestionBankDraftAnswerScoringResultResponse(
	result domain.QuestionBankDraftAnswerScoringResult,
) questionBankDraftAnswerScoringResultResponse {
	return questionBankDraftAnswerScoringResultResponse{
		SubmissionID:              result.SubmissionID,
		RequestID:                 result.RequestID,
		QuestionBankDraftRef:      result.QuestionBankDraftRef,
		TutoringAnalysisRequestID: result.TutoringAnalysisRequestID,
		ArchiveItemID:             result.ArchiveItemID,
		Status:                    result.Status,
		ScoreSummary:              optionalString(result.ScoreSummary),
		ErrorCode:                 optionalString(result.ErrorCode),
		RequestedAt:               formatTime(result.RequestedAt),
		CompletedAt:               optionalTime(result.CompletedAt),
		UpdatedAt:                 formatTime(result.UpdatedAt),
	}
}

func toAIGradingRequestListResponse(page domain.AIGradingRequestPage) aiGradingRequestListResponse {
	requests := make([]aiGradingRequestResponse, 0, len(page.Items))
	for _, request := range page.Items {
		requests = append(requests, toAIGradingRequestResponse(request))
	}
	return aiGradingRequestListResponse{
		Data: requests,
		PageInfo: pageInfoResponse{
			PageSize:   page.PageInfo.PageSize,
			HasMore:    page.PageInfo.HasMore,
			NextCursor: optionalString(page.PageInfo.NextCursor),
		},
	}
}

func toAIGradingRequestResponse(request domain.AIGradingRequest) aiGradingRequestResponse {
	return aiGradingRequestResponse{
		ID:                                   request.ID,
		ArchiveItemID:                        request.ArchiveItemID,
		RequestedByPrincipalID:               request.RequestedByPrincipalID,
		GradingInstructions:                  request.GradingInstructions,
		RubricRef:                            optionalString(request.RubricRef),
		Status:                               request.Status,
		SourceArchiveOwnerType:               request.SourceArchiveOwnerType,
		SourceArchiveStudentID:               optionalString(request.SourceArchiveStudentID),
		SourceArchiveContentRef:              request.SourceArchiveContentRef,
		SourceQuizSubmissionID:               optionalString(request.SourceQuizSubmissionID),
		SourceAnswerRef:                      optionalString(request.SourceAnswerRef),
		SourceQuestionBankDraftRef:           optionalString(request.SourceQuestionBankDraftRef),
		SourceQuestionBankAnswerSubmissionID: optionalString(request.SourceQuestionBankAnswerSubmissionID),
		SourceArchiveMaterial:                request.SourceArchiveMaterial,
		SourceArchiveOCRStatus:               request.SourceArchiveOCRStatus,
		ScoreSummary:                         optionalString(request.ScoreSummary),
		ResultRef:                            optionalString(request.ResultRef),
		ErrorCode:                            optionalString(request.ErrorCode),
		ErrorMessage:                         optionalString(request.ErrorMessage),
		ClaimedByWorkerID:                    optionalString(request.ClaimedByWorkerID),
		ClaimExpiresAt:                       optionalTime(request.ClaimExpiresAt),
		CreatedAt:                            formatTime(request.CreatedAt),
		CompletedAt:                          optionalTime(request.CompletedAt),
		UpdatedAt:                            formatTime(request.UpdatedAt),
	}
}

func toAIGradingWorkerClaimResponse(request domain.AIGradingRequest) aiGradingWorkerClaimResponse {
	return aiGradingWorkerClaimResponse{
		ID:                                   request.ID,
		ArchiveItemID:                        request.ArchiveItemID,
		GradingInstructions:                  request.GradingInstructions,
		RubricRef:                            optionalString(request.RubricRef),
		Status:                               request.Status,
		SourceArchiveOwnerType:               request.SourceArchiveOwnerType,
		SourceArchiveStudentID:               optionalString(request.SourceArchiveStudentID),
		SourceArchiveContentRef:              request.SourceArchiveContentRef,
		SourceQuizSubmissionID:               optionalString(request.SourceQuizSubmissionID),
		SourceAnswerRef:                      optionalString(request.SourceAnswerRef),
		SourceQuestionBankDraftRef:           optionalString(request.SourceQuestionBankDraftRef),
		SourceQuestionBankAnswerSubmissionID: optionalString(request.SourceQuestionBankAnswerSubmissionID),
		SourceArchiveMaterial:                request.SourceArchiveMaterial,
		SourceArchiveOCRStatus:               request.SourceArchiveOCRStatus,
		ClaimedByWorkerID:                    request.ClaimedByWorkerID,
		ClaimExpiresAt:                       formatTime(request.ClaimExpiresAt),
		CreatedAt:                            formatTime(request.CreatedAt),
		UpdatedAt:                            formatTime(request.UpdatedAt),
	}
}

func toQuestionBankDraftAnswerScoringInputResponse(
	input domain.QuestionBankDraftAnswerScoringInput,
) questionBankDraftAnswerScoringInputResponse {
	items := make([]questionBankDraftAnswerScoringInputItem, 0, len(input.Items))
	for _, item := range input.Items {
		items = append(items, questionBankDraftAnswerScoringInputItem{
			ItemID:         item.ItemID,
			QuestionText:   item.QuestionText,
			AnswerText:     item.AnswerText,
			ExpectedAnswer: item.ExpectedAnswer,
			Explanation:    item.Explanation,
			LearningTarget: item.LearningTarget,
		})
	}
	return questionBankDraftAnswerScoringInputResponse{
		RequestID:                            input.RequestID,
		ArchiveItemID:                        input.ArchiveItemID,
		GradingInstructions:                  input.GradingInstructions,
		RubricRef:                            optionalString(input.RubricRef),
		Status:                               input.Status,
		WorkerID:                             input.WorkerID,
		ClaimExpiresAt:                       formatTime(input.ClaimExpiresAt),
		SourceArchiveStudentID:               input.SourceArchiveStudentID,
		SourceQuestionBankDraftRef:           input.SourceQuestionBankDraftRef,
		SourceQuestionBankAnswerSubmissionID: input.SourceQuestionBankAnswerSubmissionID,
		SourceArchiveMaterial:                input.SourceArchiveMaterial,
		TutoringAnalysisRequestID:            input.TutoringAnalysisRequestID,
		Items:                                items,
	}
}

func toTutoringAnalysisRequestListResponse(page domain.TutoringAnalysisRequestPage) tutoringAnalysisRequestListResponse {
	requests := make([]tutoringAnalysisRequestResponse, 0, len(page.Items))
	for _, request := range page.Items {
		requests = append(requests, toTutoringAnalysisRequestResponse(request))
	}
	return tutoringAnalysisRequestListResponse{
		Data: requests,
		PageInfo: pageInfoResponse{
			PageSize:   page.PageInfo.PageSize,
			HasMore:    page.PageInfo.HasMore,
			NextCursor: optionalString(page.PageInfo.NextCursor),
		},
	}
}

func toTutoringAnalysisRequestResponse(request domain.TutoringAnalysisRequest) tutoringAnalysisRequestResponse {
	return tutoringAnalysisRequestResponse{
		ID:                     request.ID,
		ArchiveItemID:          request.ArchiveItemID,
		RequestedByPrincipalID: request.RequestedByPrincipalID,
		AnalysisGoal:           request.AnalysisGoal,
		QuestionBankIntent:     request.QuestionBankIntent,
		Status:                 request.Status,
		SourceArchiveOwnerType: request.SourceArchiveOwnerType,
		SourceArchiveStudentID: optionalString(request.SourceArchiveStudentID),
		SourceArchiveMaterial:  request.SourceArchiveMaterial,
		ResultSummary:          optionalString(request.ResultSummary),
		ResultRef:              optionalString(request.ResultRef),
		QuestionBankDraftRef:   optionalString(request.QuestionBankDraftRef),
		ErrorCode:              optionalString(request.ErrorCode),
		ErrorMessage:           optionalString(request.ErrorMessage),
		CreatedAt:              formatTime(request.CreatedAt),
		CompletedAt:            optionalTime(request.CompletedAt),
		UpdatedAt:              optionalTime(request.UpdatedAt),
	}
}

func toTutoringAnalysisWorkerClaimResponse(request domain.TutoringAnalysisRequest) tutoringAnalysisWorkerClaimResponse {
	return tutoringAnalysisWorkerClaimResponse{
		ID:                     request.ID,
		ArchiveItemID:          request.ArchiveItemID,
		AnalysisGoal:           request.AnalysisGoal,
		QuestionBankIntent:     request.QuestionBankIntent,
		Status:                 request.Status,
		SourceArchiveOwnerType: request.SourceArchiveOwnerType,
		SourceArchiveStudentID: optionalString(request.SourceArchiveStudentID),
		SourceArchiveMaterial:  request.SourceArchiveMaterial,
		ClaimedByWorkerID:      request.ClaimedByWorkerID,
		ClaimExpiresAt:         formatTime(request.ClaimExpiresAt),
		CreatedAt:              formatTime(request.CreatedAt),
		UpdatedAt:              formatTime(request.UpdatedAt),
	}
}

func toAITutorWorkerStudyPacketInputResponse(
	input domain.AITutorWorkerStudyPacketInput,
) aiTutorWorkerStudyPacketInputResponse {
	blocks := make([]aiTutorWorkerStudyPacketInputBlock, 0, len(input.Blocks))
	for _, block := range input.Blocks {
		blocks = append(blocks, aiTutorWorkerStudyPacketInputBlock{
			BlockID:   block.BlockID,
			BlockType: block.BlockType,
			SectionID: block.SectionID,
			Title:     block.Title,
			Text:      block.Text,
			PageHint:  block.PageHint,
		})
	}
	return aiTutorWorkerStudyPacketInputResponse{
		RequestID:              input.RequestID,
		ArchiveItemID:          input.ArchiveItemID,
		AnalysisGoal:           input.AnalysisGoal,
		QuestionBankIntent:     input.QuestionBankIntent,
		Status:                 input.Status,
		WorkerID:               input.WorkerID,
		ClaimExpiresAt:         formatTime(input.ClaimExpiresAt),
		SourceArchiveStudentID: input.SourceArchiveStudentID,
		SourceArchiveMaterial:  input.SourceArchiveMaterial,
		PacketStatus:           input.PacketStatus,
		RenderFormat:           input.RenderFormat,
		Blocks:                 blocks,
	}
}

func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func formatTime(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func optionalTime(value time.Time) *string {
	if value.IsZero() {
		return nil
	}
	formatted := formatTime(value)
	return &formatted
}
