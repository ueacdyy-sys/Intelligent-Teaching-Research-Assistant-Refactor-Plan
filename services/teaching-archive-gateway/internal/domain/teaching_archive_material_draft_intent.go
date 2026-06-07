package domain

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	maxArchiveMaterialDraftSourceRefs    = 16
	maxArchiveMaterialDraftArtifactRef   = 1000
	maxArchiveMaterialDraftOutputSummary = 1000
	maxArchiveMaterialDraftIdempotency   = 200
)

type TeachingArchiveMaterialDraftIntentStatus string

const (
	TeachingArchiveMaterialDraftIntentReviewRequired      TeachingArchiveMaterialDraftIntentStatus = "REVIEW_REQUIRED"
	TeachingArchiveMaterialDraftIntentReviewRequiredEvent string                                   = "AGENT_WRITE_INTENT_REVIEW_REQUIRED"
)

type TeachingArchiveMaterialDraftIntent struct {
	ID                     string
	RequestedByPrincipalID string
	SessionID              string
	OwnerType              OwnerType
	StudentID              string
	MaterialType           MaterialType
	Title                  string
	Source                 Source
	SourceRefs             []string
	DraftArtifactRef       string
	Tags                   []string
	AnalysisIntents        []AnalysisIntent
	SharedContextRef       string
	GuardrailResultRef     string
	RouteDecisionRef       string
	InputHash              string
	OutputSummary          string
	ApprovalArtifactRef    string
	RollbackPlanRef        string
	AuditTraceRef          string
	IdempotencyKey         string
	Status                 TeachingArchiveMaterialDraftIntentStatus
	ApprovalRequired       bool
	EventType              string
	CreatedAt              time.Time
}

type SubmitTeachingArchiveMaterialDraftIntentInput struct {
	Principal           PrincipalContext
	OwnerType           OwnerType
	StudentID           string
	MaterialType        MaterialType
	Title               string
	Source              Source
	SourceRefs          []string
	DraftArtifactRef    string
	Tags                []string
	AnalysisIntents     []AnalysisIntent
	SharedContextRef    string
	GuardrailResultRef  string
	RouteDecisionRef    string
	InputHash           string
	OutputSummary       string
	ApprovalArtifactRef string
	RollbackPlanRef     string
	AuditTraceRef       string
	IdempotencyKey      string
}

func NewTeachingArchiveMaterialDraftIntent(
	id string,
	input SubmitTeachingArchiveMaterialDraftIntentInput,
	createdAt time.Time,
) (TeachingArchiveMaterialDraftIntent, error) {
	if !strings.HasPrefix(id, "archive_material_draft_intent_") {
		return TeachingArchiveMaterialDraftIntent{}, fmt.Errorf("generated archive material draft intent id must use archive_material_draft_intent_ prefix")
	}
	normalized, err := NormalizeSubmitTeachingArchiveMaterialDraftIntentInput(input)
	if err != nil {
		return TeachingArchiveMaterialDraftIntent{}, err
	}
	return TeachingArchiveMaterialDraftIntent{
		ID:                     id,
		RequestedByPrincipalID: strings.TrimSpace(normalized.Principal.PrincipalID),
		SessionID:              strings.TrimSpace(normalized.Principal.SessionID),
		OwnerType:              normalized.OwnerType,
		StudentID:              normalized.StudentID,
		MaterialType:           normalized.MaterialType,
		Title:                  normalized.Title,
		Source:                 normalized.Source,
		SourceRefs:             normalized.SourceRefs,
		DraftArtifactRef:       normalized.DraftArtifactRef,
		Tags:                   normalized.Tags,
		AnalysisIntents:        normalized.AnalysisIntents,
		SharedContextRef:       normalized.SharedContextRef,
		GuardrailResultRef:     normalized.GuardrailResultRef,
		RouteDecisionRef:       normalized.RouteDecisionRef,
		InputHash:              normalized.InputHash,
		OutputSummary:          normalized.OutputSummary,
		ApprovalArtifactRef:    normalized.ApprovalArtifactRef,
		RollbackPlanRef:        normalized.RollbackPlanRef,
		AuditTraceRef:          normalized.AuditTraceRef,
		IdempotencyKey:         normalized.IdempotencyKey,
		Status:                 TeachingArchiveMaterialDraftIntentReviewRequired,
		ApprovalRequired:       true,
		EventType:              TeachingArchiveMaterialDraftIntentReviewRequiredEvent,
		CreatedAt:              createdAt.UTC(),
	}, nil
}

func NormalizeSubmitTeachingArchiveMaterialDraftIntentInput(
	input SubmitTeachingArchiveMaterialDraftIntentInput,
) (SubmitTeachingArchiveMaterialDraftIntentInput, error) {
	if !validOwnerType(input.OwnerType) {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, validationError("ownerType is unsupported")
	}
	if !validMaterialType(input.MaterialType) {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, validationError("materialType is unsupported")
	}
	if !validSource(input.Source) {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, validationError("source is unsupported")
	}
	studentID := strings.TrimSpace(input.StudentID)
	if input.OwnerType == OwnerTypeStudent && studentID == "" {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, validationError("studentId is required for student archive material draft intents")
	}
	if utf8.RuneCountInString(studentID) > maxArchiveStudentIDLength {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, validationError("studentId is too long")
	}
	title, err := normalizeRequiredText(input.Title, maxArchiveTitleLength, "title")
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, err
	}
	sourceRefs, err := normalizeRequiredTextList(
		input.SourceRefs,
		maxArchiveMaterialDraftSourceRefs,
		maxArchiveMaterialDraftArtifactRef,
		"sourceRefs",
	)
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, err
	}
	draftArtifactRef, err := normalizeRequiredText(input.DraftArtifactRef, maxArchiveMaterialDraftArtifactRef, "draftArtifactRef")
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, err
	}
	tags, err := normalizeTags(input.Tags)
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, err
	}
	intents, _, err := normalizeAnalysisIntents(input.AnalysisIntents)
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, err
	}
	sharedContextRef, err := normalizeRequiredText(input.SharedContextRef, maxArchiveMaterialDraftArtifactRef, "sharedContextRef")
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, err
	}
	guardrailResultRef, err := normalizeRequiredText(input.GuardrailResultRef, maxArchiveMaterialDraftArtifactRef, "guardrailResultRef")
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, err
	}
	routeDecisionRef, err := normalizeRequiredText(input.RouteDecisionRef, maxArchiveMaterialDraftArtifactRef, "routeDecisionRef")
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, err
	}
	inputHash, err := normalizeRequiredText(input.InputHash, maxArchiveMaterialDraftIdempotency, "inputHash")
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, err
	}
	outputSummary, err := normalizeRequiredText(input.OutputSummary, maxArchiveMaterialDraftOutputSummary, "outputSummary")
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, err
	}
	approvalArtifactRef, err := normalizeRequiredText(input.ApprovalArtifactRef, maxArchiveMaterialDraftArtifactRef, "approvalArtifactRef")
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, err
	}
	rollbackPlanRef, err := normalizeRequiredText(input.RollbackPlanRef, maxArchiveMaterialDraftArtifactRef, "rollbackPlanRef")
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, err
	}
	auditTraceRef, err := normalizeRequiredText(input.AuditTraceRef, maxArchiveMaterialDraftArtifactRef, "auditTraceRef")
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, err
	}
	idempotencyKey, err := normalizeRequiredText(input.IdempotencyKey, maxArchiveMaterialDraftIdempotency, "idempotencyKey")
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentInput{}, err
	}

	return SubmitTeachingArchiveMaterialDraftIntentInput{
		Principal:           input.Principal,
		OwnerType:           input.OwnerType,
		StudentID:           studentID,
		MaterialType:        input.MaterialType,
		Title:               title,
		Source:              input.Source,
		SourceRefs:          sourceRefs,
		DraftArtifactRef:    draftArtifactRef,
		Tags:                tags,
		AnalysisIntents:     intents,
		SharedContextRef:    sharedContextRef,
		GuardrailResultRef:  guardrailResultRef,
		RouteDecisionRef:    routeDecisionRef,
		InputHash:           inputHash,
		OutputSummary:       outputSummary,
		ApprovalArtifactRef: approvalArtifactRef,
		RollbackPlanRef:     rollbackPlanRef,
		AuditTraceRef:       auditTraceRef,
		IdempotencyKey:      idempotencyKey,
	}, nil
}

func AuthorizeSubmitTeachingArchiveMaterialDraftIntent(principal PrincipalContext) error {
	if err := ValidatePrincipalContext(principal); err != nil {
		return err
	}
	if hasScope(principal, ScopeTeachingWrite) {
		switch principal.Role {
		case RoleTeacher, RoleAdmin, RoleService:
			return nil
		}
	}
	if hasScope(principal, ScopeAgentCommandSubmit) && principal.RequiresHarnessApproval {
		return nil
	}
	return ErrForbidden
}
