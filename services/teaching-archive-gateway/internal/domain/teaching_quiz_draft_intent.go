package domain

import (
	"fmt"
	"strings"
	"time"
)

const (
	maxQuizDraftSourceMaterialRefs = 16
	maxQuizDraftLearningObjectives = 16
	maxQuizDraftObjectiveLength    = 200
	maxQuizDraftQuestionCount      = 100
	maxQuizDraftEvidenceRefLength  = 1000
	maxQuizDraftOutputSummary      = 1000
	maxQuizDraftIdempotencyKey     = 200
)

type TeachingQuizDraftDifficulty string

const (
	TeachingQuizDraftDifficultyEasy   TeachingQuizDraftDifficulty = "EASY"
	TeachingQuizDraftDifficultyMedium TeachingQuizDraftDifficulty = "MEDIUM"
	TeachingQuizDraftDifficultyHard   TeachingQuizDraftDifficulty = "HARD"
	TeachingQuizDraftDifficultyMixed  TeachingQuizDraftDifficulty = "MIXED"
)

type TeachingQuizDraftIntentStatus string

const (
	TeachingQuizDraftIntentReviewRequired      TeachingQuizDraftIntentStatus = "REVIEW_REQUIRED"
	TeachingQuizDraftIntentReviewRequiredEvent string                        = "AGENT_WRITE_INTENT_REVIEW_REQUIRED"
)

type TeachingQuizDraftIntent struct {
	ID                     string
	RequestedByPrincipalID string
	SessionID              string
	Title                  string
	SourceMaterialRefs     []string
	LearningObjectives     []string
	QuestionCount          int
	Difficulty             TeachingQuizDraftDifficulty
	SharedContextRef       string
	GuardrailResultRef     string
	RouteDecisionRef       string
	InputHash              string
	OutputSummary          string
	ApprovalArtifactRef    string
	RollbackPlanRef        string
	AuditTraceRef          string
	IdempotencyKey         string
	Status                 TeachingQuizDraftIntentStatus
	ApprovalRequired       bool
	EventType              string
	CreatedAt              time.Time
}

type SubmitTeachingQuizDraftIntentInput struct {
	Principal           PrincipalContext
	Title               string
	SourceMaterialRefs  []string
	LearningObjectives  []string
	QuestionCount       int
	Difficulty          TeachingQuizDraftDifficulty
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

func NewTeachingQuizDraftIntent(
	id string,
	input SubmitTeachingQuizDraftIntentInput,
	createdAt time.Time,
) (TeachingQuizDraftIntent, error) {
	if !strings.HasPrefix(id, "quiz_draft_intent_") {
		return TeachingQuizDraftIntent{}, fmt.Errorf("generated quiz draft intent id must use quiz_draft_intent_ prefix")
	}
	normalized, err := NormalizeSubmitTeachingQuizDraftIntentInput(input)
	if err != nil {
		return TeachingQuizDraftIntent{}, err
	}
	return TeachingQuizDraftIntent{
		ID:                     id,
		RequestedByPrincipalID: strings.TrimSpace(normalized.Principal.PrincipalID),
		SessionID:              strings.TrimSpace(normalized.Principal.SessionID),
		Title:                  normalized.Title,
		SourceMaterialRefs:     normalized.SourceMaterialRefs,
		LearningObjectives:     normalized.LearningObjectives,
		QuestionCount:          normalized.QuestionCount,
		Difficulty:             normalized.Difficulty,
		SharedContextRef:       normalized.SharedContextRef,
		GuardrailResultRef:     normalized.GuardrailResultRef,
		RouteDecisionRef:       normalized.RouteDecisionRef,
		InputHash:              normalized.InputHash,
		OutputSummary:          normalized.OutputSummary,
		ApprovalArtifactRef:    normalized.ApprovalArtifactRef,
		RollbackPlanRef:        normalized.RollbackPlanRef,
		AuditTraceRef:          normalized.AuditTraceRef,
		IdempotencyKey:         normalized.IdempotencyKey,
		Status:                 TeachingQuizDraftIntentReviewRequired,
		ApprovalRequired:       true,
		EventType:              TeachingQuizDraftIntentReviewRequiredEvent,
		CreatedAt:              createdAt.UTC(),
	}, nil
}

func NormalizeSubmitTeachingQuizDraftIntentInput(
	input SubmitTeachingQuizDraftIntentInput,
) (SubmitTeachingQuizDraftIntentInput, error) {
	title, err := normalizeRequiredText(input.Title, maxArchiveTitleLength, "title")
	if err != nil {
		return SubmitTeachingQuizDraftIntentInput{}, err
	}
	sourceRefs, err := normalizeRequiredTextList(
		input.SourceMaterialRefs,
		maxQuizDraftSourceMaterialRefs,
		maxQuizDraftEvidenceRefLength,
		"sourceMaterialRefs",
	)
	if err != nil {
		return SubmitTeachingQuizDraftIntentInput{}, err
	}
	objectives, err := normalizeRequiredTextList(
		input.LearningObjectives,
		maxQuizDraftLearningObjectives,
		maxQuizDraftObjectiveLength,
		"learningObjectives",
	)
	if err != nil {
		return SubmitTeachingQuizDraftIntentInput{}, err
	}
	if input.QuestionCount < 1 || input.QuestionCount > maxQuizDraftQuestionCount {
		return SubmitTeachingQuizDraftIntentInput{}, validationError("questionCount must be between 1 and 100")
	}
	difficulty := input.Difficulty
	if difficulty == "" {
		difficulty = TeachingQuizDraftDifficultyMixed
	}
	if !validTeachingQuizDraftDifficulty(difficulty) {
		return SubmitTeachingQuizDraftIntentInput{}, validationError("difficulty is unsupported")
	}

	sharedContextRef, err := normalizeRequiredText(input.SharedContextRef, maxQuizDraftEvidenceRefLength, "sharedContextRef")
	if err != nil {
		return SubmitTeachingQuizDraftIntentInput{}, err
	}
	guardrailResultRef, err := normalizeRequiredText(input.GuardrailResultRef, maxQuizDraftEvidenceRefLength, "guardrailResultRef")
	if err != nil {
		return SubmitTeachingQuizDraftIntentInput{}, err
	}
	routeDecisionRef, err := normalizeRequiredText(input.RouteDecisionRef, maxQuizDraftEvidenceRefLength, "routeDecisionRef")
	if err != nil {
		return SubmitTeachingQuizDraftIntentInput{}, err
	}
	inputHash, err := normalizeRequiredText(input.InputHash, maxQuizDraftIdempotencyKey, "inputHash")
	if err != nil {
		return SubmitTeachingQuizDraftIntentInput{}, err
	}
	outputSummary, err := normalizeRequiredText(input.OutputSummary, maxQuizDraftOutputSummary, "outputSummary")
	if err != nil {
		return SubmitTeachingQuizDraftIntentInput{}, err
	}
	approvalArtifactRef, err := normalizeRequiredText(input.ApprovalArtifactRef, maxQuizDraftEvidenceRefLength, "approvalArtifactRef")
	if err != nil {
		return SubmitTeachingQuizDraftIntentInput{}, err
	}
	rollbackPlanRef, err := normalizeRequiredText(input.RollbackPlanRef, maxQuizDraftEvidenceRefLength, "rollbackPlanRef")
	if err != nil {
		return SubmitTeachingQuizDraftIntentInput{}, err
	}
	auditTraceRef, err := normalizeRequiredText(input.AuditTraceRef, maxQuizDraftEvidenceRefLength, "auditTraceRef")
	if err != nil {
		return SubmitTeachingQuizDraftIntentInput{}, err
	}
	idempotencyKey, err := normalizeRequiredText(input.IdempotencyKey, maxQuizDraftIdempotencyKey, "idempotencyKey")
	if err != nil {
		return SubmitTeachingQuizDraftIntentInput{}, err
	}

	return SubmitTeachingQuizDraftIntentInput{
		Principal:           input.Principal,
		Title:               title,
		SourceMaterialRefs:  sourceRefs,
		LearningObjectives:  objectives,
		QuestionCount:       input.QuestionCount,
		Difficulty:          difficulty,
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

func AuthorizeSubmitTeachingQuizDraftIntent(principal PrincipalContext) error {
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

func normalizeRequiredTextList(values []string, maxItems int, maxLength int, field string) ([]string, error) {
	if len(values) == 0 {
		return nil, validationError(field + " must contain at least one item")
	}
	if len(values) > maxItems {
		return nil, validationError("too many " + field)
	}
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		item, err := normalizeRequiredText(value, maxLength, field)
		if err != nil {
			return nil, err
		}
		normalized = append(normalized, item)
	}
	return normalized, nil
}

func validTeachingQuizDraftDifficulty(value TeachingQuizDraftDifficulty) bool {
	switch value {
	case TeachingQuizDraftDifficultyEasy,
		TeachingQuizDraftDifficultyMedium,
		TeachingQuizDraftDifficultyHard,
		TeachingQuizDraftDifficultyMixed:
		return true
	default:
		return false
	}
}
