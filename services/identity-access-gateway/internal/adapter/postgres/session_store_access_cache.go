package postgres

import (
	"sync"
	"time"

	"ita-refactor/services/identity-access-gateway/internal/domain"
)

func (s *SessionStore) cacheSession(accessToken string, refreshToken string, principal domain.PrincipalContext) {
	if s.accessCache == nil {
		return
	}
	s.accessCache.save(accessToken, refreshToken, principal, time.Now().UTC())
}

func (s *SessionStore) rotateCachedSession(
	oldRefreshToken string,
	newAccessToken string,
	newRefreshToken string,
	principal domain.PrincipalContext,
) {
	if s.accessCache == nil {
		return
	}
	s.accessCache.rotate(oldRefreshToken, newAccessToken, newRefreshToken, principal, time.Now().UTC())
}

func (s *SessionStore) invalidateCachedAccess(accessToken string) {
	if s.accessCache == nil {
		return
	}
	s.accessCache.invalidateAccess(accessToken)
}

func (s *SessionStore) cachedPrincipalByAccess(
	accessToken string,
	now time.Time,
) (domain.PrincipalContext, bool) {
	if s.accessCache == nil {
		return domain.PrincipalContext{}, false
	}
	return s.accessCache.get(accessToken, now)
}

type sessionAccessCache struct {
	mu              sync.Mutex
	maxEntries      int
	ttl             time.Duration
	byAccessToken   map[string]sessionAccessCacheEntry
	accessByRefresh map[string]string
}

type sessionAccessCacheEntry struct {
	principal    domain.PrincipalContext
	refreshToken string
	cachedUntil  time.Time
}

func newSessionAccessCache(config SessionAccessCacheConfig) *sessionAccessCache {
	if config.MaxEntries <= 0 {
		return nil
	}
	ttl := config.TTL
	if ttl <= 0 {
		ttl = 30 * time.Second
	}
	return &sessionAccessCache{
		maxEntries:      config.MaxEntries,
		ttl:             ttl,
		byAccessToken:   map[string]sessionAccessCacheEntry{},
		accessByRefresh: map[string]string{},
	}
}

func (cache *sessionAccessCache) get(accessToken string, now time.Time) (domain.PrincipalContext, bool) {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	entry, ok := cache.byAccessToken[accessToken]
	if !ok {
		return domain.PrincipalContext{}, false
	}
	if !entry.cachedUntil.After(now) || !entry.principal.ExpiresAt.After(now) {
		cache.deleteAccessLocked(accessToken)
		return domain.PrincipalContext{}, false
	}
	return clonePrincipal(entry.principal), true
}

func (cache *sessionAccessCache) save(
	accessToken string,
	refreshToken string,
	principal domain.PrincipalContext,
	now time.Time,
) {
	if accessToken == "" {
		return
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	cache.ensureCapacityLocked(accessToken)
	if existing, ok := cache.byAccessToken[accessToken]; ok && existing.refreshToken != "" {
		delete(cache.accessByRefresh, existing.refreshToken)
	}
	cachedUntil := now.Add(cache.ttl)
	if !principal.ExpiresAt.IsZero() && principal.ExpiresAt.Before(cachedUntil) {
		cachedUntil = principal.ExpiresAt
	}
	cache.byAccessToken[accessToken] = sessionAccessCacheEntry{
		principal:    clonePrincipal(principal),
		refreshToken: refreshToken,
		cachedUntil:  cachedUntil,
	}
	if refreshToken != "" {
		cache.accessByRefresh[refreshToken] = accessToken
	}
}

func (cache *sessionAccessCache) rotate(
	oldRefreshToken string,
	newAccessToken string,
	newRefreshToken string,
	principal domain.PrincipalContext,
	now time.Time,
) {
	cache.mu.Lock()
	if oldAccessToken := cache.accessByRefresh[oldRefreshToken]; oldAccessToken != "" {
		cache.deleteAccessLocked(oldAccessToken)
	}
	delete(cache.accessByRefresh, oldRefreshToken)
	cache.mu.Unlock()
	cache.save(newAccessToken, newRefreshToken, principal, now)
}

func (cache *sessionAccessCache) invalidateAccess(accessToken string) {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	cache.deleteAccessLocked(accessToken)
}

func (cache *sessionAccessCache) ensureCapacityLocked(newAccessToken string) {
	if _, ok := cache.byAccessToken[newAccessToken]; ok {
		return
	}
	for len(cache.byAccessToken) >= cache.maxEntries {
		for accessToken := range cache.byAccessToken {
			cache.deleteAccessLocked(accessToken)
			break
		}
	}
}

func (cache *sessionAccessCache) deleteAccessLocked(accessToken string) {
	entry, ok := cache.byAccessToken[accessToken]
	if !ok {
		return
	}
	if entry.refreshToken != "" {
		delete(cache.accessByRefresh, entry.refreshToken)
	}
	delete(cache.byAccessToken, accessToken)
}

func clonePrincipal(principal domain.PrincipalContext) domain.PrincipalContext {
	principal.Scopes = append([]domain.Scope(nil), principal.Scopes...)
	principal.StudentAccess.StudentIDs = append([]string(nil), principal.StudentAccess.StudentIDs...)
	if principal.Channel != nil {
		channel := *principal.Channel
		principal.Channel = &channel
	}
	return principal
}
