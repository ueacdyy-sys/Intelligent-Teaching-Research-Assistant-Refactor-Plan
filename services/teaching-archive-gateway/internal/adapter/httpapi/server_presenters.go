package httpapi

import (
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
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
		ID:                     request.ID,
		ArchiveItemID:          request.ArchiveItemID,
		RequestedByPrincipalID: request.RequestedByPrincipalID,
		GradingInstructions:    request.GradingInstructions,
		RubricRef:              optionalString(request.RubricRef),
		Status:                 request.Status,
		SourceArchiveOwnerType: request.SourceArchiveOwnerType,
		SourceArchiveStudentID: optionalString(request.SourceArchiveStudentID),
		SourceArchiveMaterial:  request.SourceArchiveMaterial,
		SourceArchiveOCRStatus: request.SourceArchiveOCRStatus,
		ScoreSummary:           optionalString(request.ScoreSummary),
		ResultRef:              optionalString(request.ResultRef),
		ErrorCode:              optionalString(request.ErrorCode),
		ErrorMessage:           optionalString(request.ErrorMessage),
		ClaimedByWorkerID:      optionalString(request.ClaimedByWorkerID),
		ClaimExpiresAt:         optionalTime(request.ClaimExpiresAt),
		CreatedAt:              formatTime(request.CreatedAt),
		CompletedAt:            optionalTime(request.CompletedAt),
		UpdatedAt:              formatTime(request.UpdatedAt),
	}
}

func toAIGradingWorkerClaimResponse(request domain.AIGradingRequest) aiGradingWorkerClaimResponse {
	return aiGradingWorkerClaimResponse{
		ID:                     request.ID,
		ArchiveItemID:          request.ArchiveItemID,
		GradingInstructions:    request.GradingInstructions,
		RubricRef:              optionalString(request.RubricRef),
		Status:                 request.Status,
		SourceArchiveOwnerType: request.SourceArchiveOwnerType,
		SourceArchiveStudentID: optionalString(request.SourceArchiveStudentID),
		SourceArchiveMaterial:  request.SourceArchiveMaterial,
		SourceArchiveOCRStatus: request.SourceArchiveOCRStatus,
		ClaimedByWorkerID:      request.ClaimedByWorkerID,
		ClaimExpiresAt:         formatTime(request.ClaimExpiresAt),
		CreatedAt:              formatTime(request.CreatedAt),
		UpdatedAt:              formatTime(request.UpdatedAt),
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
