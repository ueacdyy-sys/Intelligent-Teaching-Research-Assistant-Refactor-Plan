package postgres_test

import (
	"context"
	"testing"
	"time"

	"ita-refactor/services/identity-access-gateway/internal/adapter/postgres"
)

func TestSessionStoreWriteLimiterStatsExposeQueuedWaits(t *testing.T) {
	db := newBlockingWriteDB()
	store := postgres.NewSessionStoreWithConfig(db, postgres.SessionStoreConfig{WriteConcurrency: 1})
	first := make(chan error, 1)
	second := make(chan error, 1)

	go func() {
		first <- store.SaveSession(context.Background(), "access_stats_1", "refresh_stats_1", teacherPrincipal("sess_stats_1"))
	}()
	db.waitForExec(t, 1)

	go func() {
		second <- store.SaveSession(context.Background(), "access_stats_2", "refresh_stats_2", teacherPrincipal("sess_stats_2"))
	}()
	waitForWriteLimiterWaiters(t, store, 1)

	stats := store.SessionWriteLimiterStats()
	if !stats.Enabled {
		t.Fatal("write limiter stats should report enabled")
	}
	if stats.Limit != 1 {
		t.Fatalf("write limiter limit = %d want 1", stats.Limit)
	}
	if stats.InUse != 1 {
		t.Fatalf("write limiter in use = %d want 1", stats.InUse)
	}
	if stats.Waiting != 1 {
		t.Fatalf("write limiter waiting = %d want 1", stats.Waiting)
	}

	db.releaseOne()
	if err := <-first; err != nil {
		t.Fatalf("first SaveSession error = %v", err)
	}
	db.waitForExec(t, 2)
	db.releaseOne()
	if err := <-second; err != nil {
		t.Fatalf("second SaveSession error = %v", err)
	}

	stats = store.SessionWriteLimiterStats()
	if stats.AcquireCount != 2 {
		t.Fatalf("write limiter acquire count = %d want 2", stats.AcquireCount)
	}
	if stats.AcquireWaitTimeMs <= 0 {
		t.Fatalf("write limiter acquire wait time = %v want > 0", stats.AcquireWaitTimeMs)
	}
	if stats.Waiting != 0 {
		t.Fatalf("write limiter waiting after release = %d want 0", stats.Waiting)
	}
}

func waitForWriteLimiterWaiters(t *testing.T, store *postgres.SessionStore, want int64) {
	t.Helper()
	deadline := time.After(time.Second)
	tick := time.NewTicker(time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-deadline:
			t.Fatalf("timed out waiting for write limiter waiters = %d", want)
		case <-tick.C:
			if store.SessionWriteLimiterStats().Waiting == want {
				return
			}
		}
	}
}
