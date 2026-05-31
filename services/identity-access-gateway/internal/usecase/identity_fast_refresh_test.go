package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/identity-access-gateway/internal/domain"
	"ita-refactor/services/identity-access-gateway/internal/usecase"
)

func TestRefreshSessionUsesOptimizedRefreshRotation(t *testing.T) {
	now := time.Date(2026, 5, 28, 8, 0, 0, 0, time.UTC)
	store := newFastRefreshStore()
	service := usecase.NewIdentityService(
		&fakeAuthenticator{},
		store,
		&sequenceIssuer{},
		fixedClock{now: now},
	)
	session, err := service.CreatePasswordSession(context.Background(), domain.PasswordSessionInput{
		Identifier: "teacher@example.com",
		Password:   "ueacd",
		EntryPoint: domain.EntryPointDesktopResearch,
	})
	if err != nil {
		t.Fatalf("CreatePasswordSession error = %v", err)
	}

	refreshed, err := service.RefreshSession(context.Background(), session.RefreshToken)
	if err != nil {
		t.Fatalf("RefreshSession error = %v", err)
	}

	if store.fastRefreshCalls != 1 {
		t.Fatalf("fastRefreshCalls = %d", store.fastRefreshCalls)
	}
	if store.refreshLookupCalls != 0 {
		t.Fatalf("optimized refresh should not read principal first, refreshLookupCalls = %d", store.refreshLookupCalls)
	}
	if refreshed.AccessToken == session.AccessToken || refreshed.RefreshToken == session.RefreshToken {
		t.Fatalf("tokens were not rotated: %#v", refreshed)
	}
	if !refreshed.Principal.IssuedAt.Equal(now) || !refreshed.Principal.ExpiresAt.Equal(now.Add(time.Hour)) {
		t.Fatalf("principal times were not updated: issued=%s expires=%s", refreshed.Principal.IssuedAt, refreshed.Principal.ExpiresAt)
	}
}

func TestRefreshSessionFastPathRejectsMissingRefreshToken(t *testing.T) {
	now := time.Date(2026, 5, 28, 8, 0, 0, 0, time.UTC)
	store := newFastRefreshStore()
	service := usecase.NewIdentityService(
		&fakeAuthenticator{},
		store,
		&sequenceIssuer{},
		fixedClock{now: now},
	)

	_, err := service.RefreshSession(context.Background(), "missing_refresh")

	if !errors.Is(err, domain.ErrInvalidSession) {
		t.Fatalf("err = %v", err)
	}
	if store.fastRefreshCalls != 1 {
		t.Fatalf("fastRefreshCalls = %d", store.fastRefreshCalls)
	}
	if store.refreshLookupCalls != 0 {
		t.Fatalf("missing refresh should not use fallback lookup, refreshLookupCalls = %d", store.refreshLookupCalls)
	}
}

type fastRefreshStore struct {
	principal          domain.PrincipalContext
	accessToken        string
	refreshToken       string
	revoked            bool
	fastRefreshCalls   int
	refreshLookupCalls int
}

func newFastRefreshStore() *fastRefreshStore {
	return &fastRefreshStore{}
}

func (s *fastRefreshStore) SaveSession(_ context.Context, accessToken string, refreshToken string, principal domain.PrincipalContext) error {
	s.accessToken = accessToken
	s.refreshToken = refreshToken
	s.principal = principal
	s.revoked = false
	return nil
}

func (s *fastRefreshStore) GetPrincipalByAccessToken(_ context.Context, accessToken string) (domain.PrincipalContext, bool, error) {
	if s.revoked || accessToken != s.accessToken {
		return domain.PrincipalContext{}, false, nil
	}
	return s.principal, true, nil
}

func (s *fastRefreshStore) GetPrincipalByRefreshToken(_ context.Context, refreshToken string) (domain.PrincipalContext, bool, error) {
	s.refreshLookupCalls += 1
	if s.revoked || refreshToken != s.refreshToken {
		return domain.PrincipalContext{}, false, nil
	}
	return s.principal, true, nil
}

func (s *fastRefreshStore) RotateSession(_ context.Context, refreshToken string, newAccessToken string, newRefreshToken string, principal domain.PrincipalContext) error {
	if s.revoked || refreshToken != s.refreshToken {
		return domain.ErrInvalidSession
	}
	s.accessToken = newAccessToken
	s.refreshToken = newRefreshToken
	s.principal = principal
	return nil
}

func (s *fastRefreshStore) RotateRefreshSession(
	_ context.Context,
	refreshToken string,
	newAccessToken string,
	newRefreshToken string,
	issuedAt time.Time,
	expiresAt time.Time,
) (domain.PrincipalContext, bool, error) {
	s.fastRefreshCalls += 1
	if s.revoked || refreshToken != s.refreshToken || s.principal.ExpiresAt.Before(issuedAt) {
		return domain.PrincipalContext{}, false, nil
	}
	s.accessToken = newAccessToken
	s.refreshToken = newRefreshToken
	s.principal.IssuedAt = issuedAt
	s.principal.ExpiresAt = expiresAt
	return s.principal, true, nil
}

func (s *fastRefreshStore) RevokeSession(_ context.Context, sessionID string) error {
	if sessionID == s.principal.SessionID {
		s.revoked = true
	}
	return nil
}
