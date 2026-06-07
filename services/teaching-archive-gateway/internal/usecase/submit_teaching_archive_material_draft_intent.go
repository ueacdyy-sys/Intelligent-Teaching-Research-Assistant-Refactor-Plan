package usecase

import (
	"context"
	"fmt"
	"strings"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type SubmitTeachingArchiveMaterialDraftIntentResult struct {
	Intent      domain.TeachingArchiveMaterialDraftIntent
	Persistence WritePersistenceOutcome
}

type SubmitTeachingArchiveMaterialDraftIntent struct {
	commandPort TeachingDraftCommandPort
	ids         IDGenerator
	clock       Clock
}

func NewSubmitTeachingArchiveMaterialDraftIntent(
	commandPort TeachingDraftCommandPort,
	ids IDGenerator,
	clock Clock,
) *SubmitTeachingArchiveMaterialDraftIntent {
	return &SubmitTeachingArchiveMaterialDraftIntent{
		commandPort: commandPort,
		ids:         ids,
		clock:       clock,
	}
}

func (uc *SubmitTeachingArchiveMaterialDraftIntent) Execute(
	ctx context.Context,
	input domain.SubmitTeachingArchiveMaterialDraftIntentInput,
) (domain.TeachingArchiveMaterialDraftIntent, error) {
	result, err := uc.ExecuteWithPersistence(ctx, input)
	if err != nil {
		return domain.TeachingArchiveMaterialDraftIntent{}, err
	}
	return result.Intent, nil
}

func (uc *SubmitTeachingArchiveMaterialDraftIntent) ExecuteWithPersistence(
	ctx context.Context,
	input domain.SubmitTeachingArchiveMaterialDraftIntentInput,
) (SubmitTeachingArchiveMaterialDraftIntentResult, error) {
	normalized, err := domain.NormalizeSubmitTeachingArchiveMaterialDraftIntentInput(input)
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentResult{}, err
	}
	if err := domain.AuthorizeSubmitTeachingArchiveMaterialDraftIntent(normalized.Principal); err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentResult{}, err
	}

	id := uc.ids.NewID()
	if !strings.HasPrefix(id, "archive_material_draft_intent_") {
		return SubmitTeachingArchiveMaterialDraftIntentResult{}, fmt.Errorf("generated archive material draft intent id must use archive_material_draft_intent_ prefix")
	}
	intent, err := domain.NewTeachingArchiveMaterialDraftIntent(id, normalized, uc.clock.Now())
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentResult{}, err
	}
	persistence, err := uc.commandPort.SubmitArchiveMaterialDraftIntent(ctx, intent)
	if err != nil {
		return SubmitTeachingArchiveMaterialDraftIntentResult{}, err
	}
	return SubmitTeachingArchiveMaterialDraftIntentResult{
		Intent:      intent,
		Persistence: normalizeWritePersistenceOutcome(persistence),
	}, nil
}
