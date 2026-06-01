package postgres_test

import (
	"testing"

	"ita-refactor/services/identity-access-gateway/internal/adapter/postgres"
	"ita-refactor/services/identity-access-gateway/internal/platform"
)

func TestSessionDBStatsProviderMergesOperationTimings(t *testing.T) {
	provider := postgres.NewSessionDBStatsProvider(
		fakeDBPoolStatsProvider{},
		fakeWriteLimiterStatsProvider{},
		fakeOperationTimingStatsProvider{},
	)

	stats := provider.SessionDBPoolStats()

	if stats.MaxConns != 8 {
		t.Fatalf("maxConns = %d want 8", stats.MaxConns)
	}
	if !stats.WriteLimiter.Enabled {
		t.Fatal("write limiter stats not merged")
	}
	saveStats := stats.SessionOperations["saveSession"]
	if saveStats.Count != 2 {
		t.Fatalf("saveSession count = %d want 2", saveStats.Count)
	}
	if saveStats.MaxElapsedMs != 7.25 {
		t.Fatalf("saveSession max elapsed = %v want 7.25", saveStats.MaxElapsedMs)
	}
}

type fakeDBPoolStatsProvider struct{}

func (fakeDBPoolStatsProvider) SessionDBPoolStats() platform.SessionDBPoolStats {
	return platform.SessionDBPoolStats{MaxConns: 8}
}

type fakeWriteLimiterStatsProvider struct{}

func (fakeWriteLimiterStatsProvider) SessionWriteLimiterStats() platform.SessionWriteLimiterStats {
	return platform.SessionWriteLimiterStats{Enabled: true, Limit: 4}
}

type fakeOperationTimingStatsProvider struct{}

func (fakeOperationTimingStatsProvider) SessionOperationTimingStats() map[string]platform.SessionOperationTimingStat {
	return map[string]platform.SessionOperationTimingStat{
		"saveSession": {
			Count:            2,
			TotalElapsedMs:   10.5,
			AverageElapsedMs: 5.25,
			MaxElapsedMs:     7.25,
		},
	}
}
