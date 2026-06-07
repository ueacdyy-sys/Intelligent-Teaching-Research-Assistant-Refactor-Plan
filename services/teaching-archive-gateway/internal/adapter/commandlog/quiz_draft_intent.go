package commandlog

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

type quizDraftIntentPayload struct {
	ID                     string                               `json:"id"`
	RequestedByPrincipalID string                               `json:"requestedByPrincipalId"`
	SessionID              string                               `json:"sessionId"`
	Title                  string                               `json:"title"`
	SourceMaterialRefs     []string                             `json:"sourceMaterialRefs"`
	LearningObjectives     []string                             `json:"learningObjectives"`
	QuestionCount          int                                  `json:"questionCount"`
	Difficulty             domain.TeachingQuizDraftDifficulty   `json:"difficulty"`
	SharedContextRef       string                               `json:"sharedContextRef"`
	GuardrailResultRef     string                               `json:"guardrailResultRef"`
	RouteDecisionRef       string                               `json:"routeDecisionRef"`
	InputHash              string                               `json:"inputHash"`
	OutputSummary          string                               `json:"outputSummary"`
	ApprovalArtifactRef    string                               `json:"approvalArtifactRef"`
	RollbackPlanRef        string                               `json:"rollbackPlanRef"`
	AuditTraceRef          string                               `json:"auditTraceRef"`
	IdempotencyKey         string                               `json:"idempotencyKey"`
	Status                 domain.TeachingQuizDraftIntentStatus `json:"status"`
	ApprovalRequired       bool                                 `json:"approvalRequired"`
	EventType              string                               `json:"eventType"`
	CreatedAt              time.Time                            `json:"createdAt"`
}

type IntentRepositoryConfig struct {
	Path            string
	AppendBatchSize int
	AppendMaxDelay  time.Duration
	Sync            bool
}

type IntentRepository struct {
	appender         *durableAppender
	closeOnce        sync.Once
	closed           atomic.Bool
	acceptedCommands atomic.Int64
	appendErrors     atomic.Int64
}

func NewIntentRepository(config IntentRepositoryConfig) (*IntentRepository, error) {
	if config.Path == "" {
		return nil, errors.New("command intent log path is required")
	}
	if config.AppendBatchSize < 1 {
		config.AppendBatchSize = 1
	}
	appender, err := newDurableAppender(durableAppenderConfig{
		Path:      config.Path,
		BatchSize: config.AppendBatchSize,
		MaxDelay:  config.AppendMaxDelay,
		Sync:      config.Sync,
	})
	if err != nil {
		return nil, err
	}
	return &IntentRepository{appender: appender}, nil
}

func (r *IntentRepository) SubmitQuizDraftIntent(
	ctx context.Context,
	intent domain.TeachingQuizDraftIntent,
) (usecase.WritePersistenceOutcome, error) {
	if r.closed.Load() {
		return usecase.WritePersistenceOutcome{}, ErrRepositoryClosed
	}
	commandID := CommandIDForQuizDraftIntent(intent.ID)
	record := commandRecord{
		SchemaVersion:   schemaVersion,
		CommandID:       commandID,
		Type:            "submit_teaching_quiz_draft_intent",
		AcceptedAt:      time.Now().UTC(),
		QuizDraftIntent: quizDraftIntentToPayload(intent),
	}
	if err := appendCommandIntent(ctx, r.appender, &r.appendErrors, &r.acceptedCommands, record); err != nil {
		return usecase.WritePersistenceOutcome{}, err
	}
	return usecase.AcceptedWriteOutcome(commandID), nil
}

func (r *IntentRepository) Close() {
	r.closeOnce.Do(func() {
		r.closed.Store(true)
		r.appender.Close()
	})
}

func (r *Repository) SubmitQuizDraftIntent(
	ctx context.Context,
	intent domain.TeachingQuizDraftIntent,
) (usecase.WritePersistenceOutcome, error) {
	if r.closed.Load() {
		return usecase.WritePersistenceOutcome{}, ErrRepositoryClosed
	}
	commandID := CommandIDForQuizDraftIntent(intent.ID)
	record := commandRecord{
		SchemaVersion:   schemaVersion,
		CommandID:       commandID,
		Type:            "submit_teaching_quiz_draft_intent",
		AcceptedAt:      time.Now().UTC(),
		QuizDraftIntent: quizDraftIntentToPayload(intent),
	}
	if err := r.acceptCommandIntent(ctx, record); err != nil {
		return usecase.WritePersistenceOutcome{}, err
	}
	return usecase.AcceptedWriteOutcome(commandID), nil
}

func CommandIDForQuizDraftIntent(intentID string) string {
	return "cmd_" + intentID
}

func (r *Repository) acceptCommandIntent(ctx context.Context, record commandRecord) error {
	return appendCommandIntent(ctx, r.appender, &r.appendErrors, &r.acceptedCommands, record)
}

func appendCommandIntent(
	ctx context.Context,
	appender *durableAppender,
	appendErrors *atomic.Int64,
	acceptedCommands *atomic.Int64,
	record commandRecord,
) error {
	appendStart := time.Now()
	if err := appender.Append(ctx, record); err != nil {
		appendErrors.Add(1)
		recordCommandAppendTiming(ctx, time.Since(appendStart))
		return err
	}
	recordCommandAppendTiming(ctx, time.Since(appendStart))
	acceptedCommands.Add(1)
	return nil
}

func quizDraftIntentToPayload(intent domain.TeachingQuizDraftIntent) *quizDraftIntentPayload {
	return &quizDraftIntentPayload{
		ID:                     intent.ID,
		RequestedByPrincipalID: intent.RequestedByPrincipalID,
		SessionID:              intent.SessionID,
		Title:                  intent.Title,
		SourceMaterialRefs:     append([]string(nil), intent.SourceMaterialRefs...),
		LearningObjectives:     append([]string(nil), intent.LearningObjectives...),
		QuestionCount:          intent.QuestionCount,
		Difficulty:             intent.Difficulty,
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
