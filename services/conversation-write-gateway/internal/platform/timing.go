package platform

import (
	"context"
	"time"
)

type ConversationTiming struct {
	DBAcquire time.Duration
	DBInsert  time.Duration
}

type conversationTimingContextKey struct{}

func WithConversationTiming(ctx context.Context, timing *ConversationTiming) context.Context {
	return context.WithValue(ctx, conversationTimingContextKey{}, timing)
}

func ConversationTimingFromContext(ctx context.Context) *ConversationTiming {
	timing, _ := ctx.Value(conversationTimingContextKey{}).(*ConversationTiming)
	return timing
}
