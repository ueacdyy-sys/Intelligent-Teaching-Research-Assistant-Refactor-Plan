package httpapi

import (
	"net/http"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
)

func (s *Server) submitQuizDraftIntent(w http.ResponseWriter, r *http.Request) {
	handlerStart := time.Now()
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.submitTeachingQuizDraftIntent == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "quiz draft intent use case is not configured")
		return
	}

	var request submitTeachingQuizDraftIntentRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	timing := &platform.TeachingArchiveTiming{}
	ctx := platform.WithTeachingArchiveTiming(r.Context(), timing)
	preUsecaseDuration := time.Since(handlerStart)
	appStart := time.Now()
	result, err := s.submitTeachingQuizDraftIntent.ExecuteWithPersistence(ctx, domain.SubmitTeachingQuizDraftIntentInput{
		Principal:           principal,
		Title:               request.Title,
		SourceMaterialRefs:  request.SourceMaterialRefs,
		LearningObjectives:  request.LearningObjectives,
		QuestionCount:       request.QuestionCount,
		Difficulty:          request.Difficulty,
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
	if handleArchiveError(w, err, "failed to submit quiz draft intent") {
		return
	}

	w.Header().Set("X-Teaching-Write-Acceptance", "review-only-command-intent")
	writeTeachingJSON(
		w,
		http.StatusAccepted,
		toAcceptedTeachingQuizDraftIntentResponse(result),
		handlerStart,
		preUsecaseDuration,
		time.Since(appStart),
		timing,
	)
}
