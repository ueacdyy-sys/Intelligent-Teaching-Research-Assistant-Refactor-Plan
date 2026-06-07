package commandlog

import (
	"context"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

type archiveMaterialDraftIntentPayload struct {
	ID                     string                                          `json:"id"`
	RequestedByPrincipalID string                                          `json:"requestedByPrincipalId"`
	SessionID              string                                          `json:"sessionId"`
	OwnerType              domain.OwnerType                                `json:"ownerType"`
	StudentID              string                                          `json:"studentId,omitempty"`
	MaterialType           domain.MaterialType                             `json:"materialType"`
	Title                  string                                          `json:"title"`
	Source                 domain.Source                                   `json:"source"`
	SourceRefs             []string                                        `json:"sourceRefs"`
	DraftArtifactRef       string                                          `json:"draftArtifactRef"`
	Tags                   []string                                        `json:"tags"`
	AnalysisIntents        []domain.AnalysisIntent                         `json:"analysisIntents"`
	SharedContextRef       string                                          `json:"sharedContextRef"`
	GuardrailResultRef     string                                          `json:"guardrailResultRef"`
	RouteDecisionRef       string                                          `json:"routeDecisionRef"`
	InputHash              string                                          `json:"inputHash"`
	OutputSummary          string                                          `json:"outputSummary"`
	ApprovalArtifactRef    string                                          `json:"approvalArtifactRef"`
	RollbackPlanRef        string                                          `json:"rollbackPlanRef"`
	AuditTraceRef          string                                          `json:"auditTraceRef"`
	IdempotencyKey         string                                          `json:"idempotencyKey"`
	Status                 domain.TeachingArchiveMaterialDraftIntentStatus `json:"status"`
	ApprovalRequired       bool                                            `json:"approvalRequired"`
	EventType              string                                          `json:"eventType"`
	CreatedAt              time.Time                                       `json:"createdAt"`
}

func (r *IntentRepository) SubmitArchiveMaterialDraftIntent(
	ctx context.Context,
	intent domain.TeachingArchiveMaterialDraftIntent,
) (usecase.WritePersistenceOutcome, error) {
	if r.closed.Load() {
		return usecase.WritePersistenceOutcome{}, ErrRepositoryClosed
	}
	commandID := CommandIDForArchiveMaterialDraftIntent(intent.ID)
	record := commandRecord{
		SchemaVersion:              schemaVersion,
		CommandID:                  commandID,
		Type:                       "submit_teaching_archive_material_draft_intent",
		AcceptedAt:                 time.Now().UTC(),
		ArchiveMaterialDraftIntent: archiveMaterialDraftIntentToPayload(intent),
	}
	if err := appendCommandIntent(ctx, r.appender, &r.appendErrors, &r.acceptedCommands, record); err != nil {
		return usecase.WritePersistenceOutcome{}, err
	}
	return usecase.AcceptedWriteOutcome(commandID), nil
}

func (r *Repository) SubmitArchiveMaterialDraftIntent(
	ctx context.Context,
	intent domain.TeachingArchiveMaterialDraftIntent,
) (usecase.WritePersistenceOutcome, error) {
	if r.closed.Load() {
		return usecase.WritePersistenceOutcome{}, ErrRepositoryClosed
	}
	commandID := CommandIDForArchiveMaterialDraftIntent(intent.ID)
	record := commandRecord{
		SchemaVersion:              schemaVersion,
		CommandID:                  commandID,
		Type:                       "submit_teaching_archive_material_draft_intent",
		AcceptedAt:                 time.Now().UTC(),
		ArchiveMaterialDraftIntent: archiveMaterialDraftIntentToPayload(intent),
	}
	if err := r.acceptCommandIntent(ctx, record); err != nil {
		return usecase.WritePersistenceOutcome{}, err
	}
	return usecase.AcceptedWriteOutcome(commandID), nil
}

func CommandIDForArchiveMaterialDraftIntent(intentID string) string {
	return "cmd_" + intentID
}

func archiveMaterialDraftIntentToPayload(
	intent domain.TeachingArchiveMaterialDraftIntent,
) *archiveMaterialDraftIntentPayload {
	return &archiveMaterialDraftIntentPayload{
		ID:                     intent.ID,
		RequestedByPrincipalID: intent.RequestedByPrincipalID,
		SessionID:              intent.SessionID,
		OwnerType:              intent.OwnerType,
		StudentID:              intent.StudentID,
		MaterialType:           intent.MaterialType,
		Title:                  intent.Title,
		Source:                 intent.Source,
		SourceRefs:             append([]string(nil), intent.SourceRefs...),
		DraftArtifactRef:       intent.DraftArtifactRef,
		Tags:                   append([]string(nil), intent.Tags...),
		AnalysisIntents:        append([]domain.AnalysisIntent(nil), intent.AnalysisIntents...),
		SharedContextRef:       intent.SharedContextRef,
		GuardrailResultRef:     intent.GuardrailResultRef,
		RouteDecisionRef:       intent.RouteDecisionRef,
		InputHash:              intent.InputHash,
		OutputSummary:          intent.OutputSummary,
		ApprovalArtifactRef:    intent.ApprovalArtifactRef,
		RollbackPlanRef:        intent.RollbackPlanRef,
		AuditTraceRef:          intent.AuditTraceRef,
		IdempotencyKey:         intent.IdempotencyKey,
		Status:                 intent.Status,
		ApprovalRequired:       intent.ApprovalRequired,
		EventType:              intent.EventType,
		CreatedAt:              intent.CreatedAt,
	}
}
