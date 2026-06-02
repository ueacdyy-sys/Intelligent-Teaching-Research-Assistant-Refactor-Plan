package usecase

import (
	"testing"
	"time"
)

func TestRevokedAccessTokenDenyCacheDropsExpiredEntries(t *testing.T) {
	now := time.Date(2026, 6, 2, 9, 0, 0, 0, time.UTC)
	cache := newRevokedAccessTokenDenyCache(4)
	cache.remember("access_revoked", now.Add(time.Second), now)

	if !cache.contains("access_revoked", now) {
		t.Fatal("fresh deny entry was not matched")
	}
	if cache.contains("access_revoked", now.Add(2*time.Second)) {
		t.Fatal("expired deny entry still matched")
	}
	if len(cache.expiresAt) != 0 {
		t.Fatalf("expired entry was not pruned, len = %d", len(cache.expiresAt))
	}
}

func TestRevokedAccessTokenDenyCacheBoundsEntryCount(t *testing.T) {
	now := time.Date(2026, 6, 2, 9, 0, 0, 0, time.UTC)
	cache := newRevokedAccessTokenDenyCache(2)

	cache.remember("access_1", now.Add(time.Minute), now)
	cache.remember("access_2", now.Add(2*time.Minute), now)
	cache.remember("access_3", now.Add(3*time.Minute), now)

	if len(cache.expiresAt) != 2 {
		t.Fatalf("cache len = %d want 2", len(cache.expiresAt))
	}
	if cache.contains("access_1", now) {
		t.Fatal("oldest token was not evicted")
	}
	if !cache.contains("access_2", now) || !cache.contains("access_3", now) {
		t.Fatal("newer tokens were not retained")
	}
}
