package usecase

import (
	"context"
	"fmt"
	"strings"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type TeachingDraftCommandPort interface {
	SubmitQuizDraftIntent(ctx context.Context, intent domain.TeachingQuizDraftIntent) (WritePersistenceOutcome, error)
	SubmitArchiveMaterialDraftIntent(ctx context.Context, intent domain.TeachingArchiveMaterialDraftIntent) (WritePersistenceOutcome, error)
}

type SubmitTeachingQuizDraftIntentResult struct {
	Intent      domain.TeachingQuizDraftIntent
	Persistence WritePersistenceOutcome
}

type SubmitTeachingQuizDraftIntent struct {
	commandPort TeachingDraftCommandPort
	ids         IDGenerator
	clock       Clock
}

func NewSubmitTeachingQuizDraftIntent(
	commandPort TeachingDraftCommandPort,
	ids IDGenerator,
	clock Clock,
) *SubmitTeachingQuizDraftIntent {
	return &SubmitTeachingQuizDraftIntent{
		commandPort: commandPort,
		ids:         ids,
		clock:       clock,
	}
}

func (uc *SubmitTeachingQuizDraftIntent) Execute(
	ctx context.Context,
	input domain.SubmitTeachingQuizDraftIntentInput,
) (domain.TeachingQuizDraftIntent, error) {
	result, err := uc.ExecuteWithPersistence(ctx, input)
	if err != nil {
		return domain.TeachingQuizDraftIntent{}, err
	}
	return result.Intent, nil
}

func (uc *SubmitTeachingQuizDraftIntent) ExecuteWithPersistence(
	ctx context.Context,
	input domain.SubmitTeachingQuizDraftIntentInput,
) (SubmitTeachingQuizDraftIntentResult, error) {
	normalized, err := domain.NormalizeSubmitTeachingQuizDraftIntentInput(input)
	if err != nil {
		return SubmitTeachingQuizDraftIntentResult{}, err
	}
	if err := domain.AuthorizeSubmitTeachingQuizDraftIntent(normalized.Principal); err != nil {
		return SubmitTeachingQuizDraftIntentResult{}, err
	}

	id := uc.ids.NewID()
	if !strings.HasPrefix(id, "quiz_draft_intent_") {
		return SubmitTeachingQuizDraftIntentResult{}, fmt.Errorf("generated quiz draft intent id must use quiz_draft_intent_ prefix")
	}
	intent, err := domain.NewTeachingQuizDraftIntent(id, normalized, uc.clock.Now())
	if err != nil {
		return SubmitTeachingQuizDraftIntentResult{}, err
	}
	persistence, err := uc.commandPort.SubmitQuizDraftIntent(ctx, intent)
	if err != nil {
		return SubmitTeachingQuizDraftIntentResult{}, err
	}
	return SubmitTeachingQuizDraftIntentResult{
		Intent:      intent,
		Persistence: normalizeWritePersistenceOutcome(persistence),
	}, nil
}
