package main

import (
	"context"
	"net"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"

	"ita-refactor/services/conversation-write-gateway/internal/adapter/postgres"
)

func TestConversationRepositoryFromConfigDisablesBatchingByDefault(t *testing.T) {
	t.Setenv("CONVERSATION_WRITE_BATCH_SIZE", "")
	t.Setenv("CONVERSATION_WRITE_BATCH_DELAY_MS", "")

	repository := conversationRepositoryFromConfig(fakeConfigDB{})

	if _, ok := repository.(*postgres.ConversationRepository); !ok {
		t.Fatalf("repository type = %T want *postgres.ConversationRepository", repository)
	}
}

func TestConversationRepositoryFromConfigEnablesBatchingOnlyAboveOne(t *testing.T) {
	t.Setenv("CONVERSATION_WRITE_BATCH_SIZE", "8")
	t.Setenv("CONVERSATION_WRITE_BATCH_DELAY_MS", "2")

	repository := conversationRepositoryFromConfig(fakeConfigDB{})

	batchingRepository, ok := repository.(*postgres.BatchingConversationRepository)
	if !ok {
		t.Fatalf("repository type = %T want *postgres.BatchingConversationRepository", repository)
	}
	defer batchingRepository.Close()
}

func TestConnectionStateTrackerCountsLifecycleTransitions(t *testing.T) {
	tracker := newConnectionStateTracker()
	left, right := net.Pipe()
	defer left.Close()
	defer right.Close()

	tracker.ConnState(left, http.StateNew)
	stats := tracker.ConversationRuntimeStats()
	if stats.AcceptedConns != 1 || stats.CurrentConns != 1 || stats.MaxCurrentConns != 1 {
		t.Fatalf("new stats = %#v", stats)
	}

	tracker.ConnState(left, http.StateActive)
	stats = tracker.ConversationRuntimeStats()
	if stats.ActiveConns != 1 || stats.IdleConns != 0 || stats.CurrentConns != 1 {
		t.Fatalf("active stats = %#v", stats)
	}

	tracker.ConnState(left, http.StateIdle)
	stats = tracker.ConversationRuntimeStats()
	if stats.ActiveConns != 0 || stats.IdleConns != 1 || stats.CurrentConns != 1 {
		t.Fatalf("idle stats = %#v", stats)
	}

	tracker.ConnState(left, http.StateClosed)
	stats = tracker.ConversationRuntimeStats()
	if stats.CurrentConns != 0 || stats.IdleConns != 0 || stats.ClosedConns != 1 {
		t.Fatalf("closed stats = %#v", stats)
	}
}

func TestConnectionStateTrackerCountsHijackedConnections(t *testing.T) {
	tracker := newConnectionStateTracker()
	left, right := net.Pipe()
	defer left.Close()
	defer right.Close()

	tracker.ConnState(left, http.StateNew)
	tracker.ConnState(left, http.StateActive)
	tracker.ConnState(left, http.StateHijacked)

	stats := tracker.ConversationRuntimeStats()
	if stats.CurrentConns != 0 || stats.ActiveConns != 0 || stats.HijackedConns != 1 {
		t.Fatalf("hijacked stats = %#v", stats)
	}
}

type fakeConfigDB struct{}

func (fakeConfigDB) Acquire(context.Context) (postgres.Conn, error) {
	return fakeConfigConn{}, nil
}

type fakeConfigConn struct{}

func (fakeConfigConn) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

func (fakeConfigConn) Release() {}
