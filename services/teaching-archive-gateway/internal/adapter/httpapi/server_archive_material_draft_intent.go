package httpapi

import (
	"net/http"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
)

func (s *Server) submitArchiveMaterialDraftIntent(w http.ResponseWriter, r *http.Request) {
	handlerStart := time.Now()
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.submitTeachingArchiveMaterialDraftIntent == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "archive material draft intent use case is not configured")
		return
	}

	var request submitTeachingArchiveMaterialDraftIntentRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	timing := &platform.TeachingArchiveTiming{}
	ctx := platform.WithTeachingArchiveTiming(r.Context(), timing)
	preUsecaseDuration := time.Since(handlerStart)
	appStart := time.Now()
	result, err := s.submitTeachingArchiveMaterialDraftIntent.ExecuteWithPersistence(ctx, domain.SubmitTeachingArchiveMaterialDraftIntentInput{
		Principal:           principal,
		OwnerType:           request.OwnerType,
		StudentID:           request.StudentID,
		MaterialType:        request.MaterialType,
		Title:               request.Title,
		Source:              request.Source,
		SourceRefs:          request.SourceRefs,
		DraftArtifactRef:    request.DraftArtifactRef,
		Tags:                request.Tags,
		AnalysisIntents:     request.AnalysisIntents,
		SharedContextRef:    request.SharedContextRef,
		GuardrailResultRef:  request.GuardrailResultRef,
		RouteDecisionRef:    request.RouteDecisionRef,
		InputHash:           request.InputHash,
		OutputSummary:       request.OutputSummary,
		ApprovalArtifactRef: request.ApprovalArtifactRef,
		RollbackPlanRef:     request.RollbackPlanRef,
		AuditTraceRef:       request.AuditTraceRef,
		IdempotencyKey:      request.IdempotencyKey,
	})
	if handleArchiveError(w, err, "failed to submit archive material draft intent") {
		return
	}

	w.Header().Set("X-Teaching-Write-Acceptance", "review-only-command-intent")
	writeTeachingJSON(
		w,
		http.StatusAccepted,
		toAcceptedTeachingArchiveMaterialDraftIntentResponse(result),
		handlerStart,
		preUsecaseDuration,
		time.Since(appStart),
		timing,
	)
}
