package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type claimAIGradingRequestRequest struct {
	WorkerID     string `json:"workerId"`
	LeaseSeconds int    `json:"leaseSeconds,omitempty"`
}

type aiGradingWorkerClaimResponse struct {
	ID                     string                 `json:"id"`
	ArchiveItemID          string                 `json:"archiveItemId"`
	GradingInstructions    string                 `json:"gradingInstructions"`
	RubricRef              *string                `json:"rubricRef,omitempty"`
	Status                 domain.AIGradingStatus `json:"status"`
	SourceArchiveOwnerType domain.OwnerType       `json:"sourceArchiveOwnerType"`
	SourceArchiveStudentID *string                `json:"sourceArchiveStudentId,omitempty"`
	SourceArchiveMaterial  domain.MaterialType    `json:"sourceArchiveMaterial"`
	SourceArchiveOCRStatus domain.OCRStatus       `json:"sourceArchiveOcrStatus"`
	ClaimedByWorkerID      string                 `json:"claimedByWorkerId"`
	ClaimExpiresAt         string                 `json:"claimExpiresAt"`
	CreatedAt              string                 `json:"createdAt"`
	UpdatedAt              string                 `json:"updatedAt"`
}

func (s *Server) aiGradingRequestSubresources(w http.ResponseWriter, r *http.Request) {
	if !parseAIGradingWorkerClaimPath(r.URL.Path) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "ai grading request subresource not found")
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.claimAIGradingRequestMetadata(w, r)
}

func (s *Server) claimAIGradingRequestMetadata(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}

	var request claimAIGradingRequestRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if s.claimAIGradingRequest == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "ai grading claim use case is not configured")
		return
	}

	claimed, found, err := s.claimAIGradingRequest.Execute(
		r.Context(),
		domain.ClaimAIGradingRequestInput{
			Principal:    principal,
			WorkerID:     request.WorkerID,
			LeaseSeconds: request.LeaseSeconds,
		},
	)
	if handleArchiveError(w, err, "failed to claim ai grading request") {
		return
	}
	if !found {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	writeJSON(w, http.StatusOK, toAIGradingWorkerClaimResponse(claimed))
}

func parseAIGradingWorkerClaimPath(path string) bool {
	return path == "/v1/teaching/ai-grading-requests/worker-claims"
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
