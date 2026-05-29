package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/conversation-write-gateway/internal/domain"
	"ita-refactor/services/conversation-write-gateway/internal/usecase"
)

func TestCreateConversationTrimsTitleAndPersists(t *testing.T) {
	repo := &fakeRepository{}
	events := &fakeEvents{}
	now := time.Date(2026, 5, 28, 13, 0, 0, 0, time.UTC)
	uc := usecase.NewCreateConversation(
		repo,
		events,
		fixedIDs{id: "conv_fixed"},
		fixedClock{now: now},
	)

	got, err := uc.Execute(context.Background(), domain.CreateConversationInput{
		Title: "  多模型融合研究  ",
		Settings: domain.Settings{
			"fusionMode": "balanced",
		},
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if got.ID != "conv_fixed" {
		t.Fatalf("ID = %q", got.ID)
	}
	if got.Title != "多模型融合研究" {
		t.Fatalf("Title = %q", got.Title)
	}
	if got.CreatedAt != now || got.UpdatedAt != now {
		t.Fatalf("timestamps = %s / %s", got.CreatedAt, got.UpdatedAt)
	}
	if got.MessageCount != 0 || got.TotalTokens != 0 {
		t.Fatalf("counters = %d / %d", got.MessageCount, got.TotalTokens)
	}
	if repo.created.ID != got.ID {
		t.Fatalf("repository did not receive created conversation")
	}
	if events.created.ID != got.ID {
		t.Fatalf("event publisher did not receive created conversation")
	}
}

func TestCreateConversationRejectsBlankTitle(t *testing.T) {
	uc := usecase.NewCreateConversation(&fakeRepository{}, nil, fixedIDs{id: "conv_fixed"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateConversationInput{Title: "   "})
	if !errors.Is(err, domain.ErrInvalidTitle) {
		t.Fatalf("error = %v, want ErrInvalidTitle", err)
	}
}

func TestCreateConversationRequiresPrefixedServerID(t *testing.T) {
	uc := usecase.NewCreateConversation(&fakeRepository{}, nil, fixedIDs{id: "bad_id"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateConversationInput{Title: "Valid"})
	if err == nil {
		t.Fatal("expected generated id prefix validation error")
	}
}

type fakeRepository struct {
	created domain.Conversation
}

func (f *fakeRepository) Create(_ context.Context, conversation domain.Conversation) error {
	f.created = conversation
	return nil
}

type fakeEvents struct {
	created domain.Conversation
}

func (f *fakeEvents) ConversationCreated(_ context.Context, conversation domain.Conversation) error {
	f.created = conversation
	return nil
}

type fixedIDs struct {
	id string
}

func (f fixedIDs) NewID() string {
	return f.id
}

type fixedClock struct {
	now time.Time
}

func (f fixedClock) Now() time.Time {
	if f.now.IsZero() {
		return time.Date(2026, 5, 28, 0, 0, 0, 0, time.UTC)
	}
	return f.now
}
