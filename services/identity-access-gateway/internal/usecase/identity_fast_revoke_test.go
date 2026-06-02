package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/identity-access-gateway/internal/domain"
	"ita-refactor/services/identity-access-gateway/internal/usecase"
)

func TestRevokeSessionUsesOptimizedOwnSessionRevoke(t *testing.T) {
	now := time.Date(2026, 5, 28, 8, 0, 0, 0, time.UTC)
	store := newFastRevokeStore()
	service := usecase.NewIdentityService(
		&fakeAuthenticator{},
		store,
		fixedIssuer{},
		fixedClock{now: now},
	)
	session, err := service.CreatePasswordSession(context.Background(), domain.PasswordSessionInput{
		Identifier: "student001",
		Password:   "ueacd",
		EntryPoint: domain.EntryPointStudentApp,
	})
	if err != nil {
		t.Fatalf("CreatePasswordSession error = %v", err)
	}

	if err := service.RevokeSession(context.Background(), session.AccessToken, session.Principal.SessionID); err != nil {
		t.Fatalf("RevokeSession error = %v", err)
	}

	if store.fastRevokeCalls != 1 {
		t.Fatalf("fastRevokeCalls = %d", store.fastRevokeCalls)
	}
	if store.accessLookupCalls != 0 {
		t.Fatalf("self revoke should not read principal first, accessLookupCalls = %d", store.accessLookupCalls)
	}
	if !store.revoked {
		t.Fatal("session was not revoked")
	}
}

func TestRevokeSessionDenyCachesRevokedOwnAccessToken(t *testing.T) {
	now := time.Date(2026, 5, 28, 8, 0, 0, 0, time.UTC)
	store := newFastRevokeStore()
	service := usecase.NewIdentityService(
		&fakeAuthenticator{},
		store,
		fixedIssuer{},
		fixedClock{now: now},
	)
	session, err := service.CreatePasswordSession(context.Background(), domain.PasswordSessionInput{
		Identifier: "student001",
		Password:   "ueacd",
		EntryPoint: domain.EntryPointStudentApp,
	})
	if err != nil {
		t.Fatalf("CreatePasswordSession error = %v", err)
	}

	if err := service.RevokeSession(context.Background(), session.AccessToken, session.Principal.SessionID); err != nil {
		t.Fatalf("RevokeSession error = %v", err)
	}
	if _, err := service.GetPrincipal(context.Background(), session.AccessToken); !errors.Is(err, domain.ErrInvalidSession) {
		t.Fatalf("revoked access err = %v", err)
	}
	if store.accessLookupCalls != 0 {
		t.Fatalf("deny-cached revoked token should not hit store, accessLookupCalls = %d", store.accessLookupCalls)
	}
}

func TestRevokeSessionFallsBackForDifferentSession(t *testing.T) {
	now := time.Date(2026, 5, 28, 8, 0, 0, 0, time.UTC)
	store := newFastRevokeStore()
	service := usecase.NewIdentityService(
		&fakeAuthenticator{},
		store,
		fixedIssuer{},
		fixedClock{now: now},
	)
	session, err := service.CreatePasswordSession(context.Background(), domain.PasswordSessionInput{
		Identifier: "student001",
		Password:   "ueacd",
		EntryPoint: domain.EntryPointStudentApp,
	})
	if err != nil {
		t.Fatalf("CreatePasswordSession error = %v", err)
	}

	err = service.RevokeSession(context.Background(), session.AccessToken, "sess_other")

	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("err = %v", err)
	}
	if store.fastRevokeCalls != 1 {
		t.Fatalf("fastRevokeCalls = %d", store.fastRevokeCalls)
	}
	if store.accessLookupCalls != 1 {
		t.Fatalf("fallback accessLookupCalls = %d", store.accessLookupCalls)
	}
	if store.revoked {
		t.Fatal("different-session revoke should not revoke")
	}
	principal, lookupErr := service.GetPrincipal(context.Background(), session.AccessToken)
	if lookupErr != nil {
		t.Fatalf("current access token was deny-cached after failed revoke, err = %v", lookupErr)
	}
	if principal.SessionID != session.Principal.SessionID {
		t.Fatalf("session id = %s, want %s", principal.SessionID, session.Principal.SessionID)
	}
	if store.accessLookupCalls != 2 {
		t.Fatalf("post-fallback lookup should still hit store, accessLookupCalls = %d", store.accessLookupCalls)
	}
}

type fastRevokeStore struct {
	principal         domain.PrincipalContext
	accessToken       string
	refreshToken      string
	revoked           bool
	fastRevokeCalls   int
	accessLookupCalls int
}

func newFastRevokeStore() *fastRevokeStore {
	return &fastRevokeStore{}
}

func (s *fastRevokeStore) SaveSession(_ context.Context, accessToken string, refreshToken string, principal domain.PrincipalContext) error {
	s.accessToken = accessToken
	s.refreshToken = refreshToken
	s.principal = principal
	s.revoked = false
	return nil
}

func (s *fastRevokeStore) GetPrincipalByAccessToken(_ context.Context, accessToken string) (domain.PrincipalContext, bool, error) {
	s.accessLookupCalls += 1
	if s.revoked || accessToken != s.accessToken {
		return domain.PrincipalContext{}, false, nil
	}
	return s.principal, true, nil
}

func (s *fastRevokeStore) GetPrincipalByRefreshToken(_ context.Context, refreshToken string) (domain.PrincipalContext, bool, error) {
	if s.revoked || refreshToken != s.refreshToken {
		return domain.PrincipalContext{}, false, nil
	}
	return s.principal, true, nil
}

func (s *fastRevokeStore) RotateSession(_ context.Context, refreshToken string, newAccessToken string, newRefreshToken string, principal domain.PrincipalContext) error {
	if s.revoked || refreshToken != s.refreshToken {
		return domain.ErrInvalidSession
	}
	s.accessToken = newAccessToken
	s.refreshToken = newRefreshToken
	s.principal = principal
	return nil
}

func (s *fastRevokeStore) RevokeSession(_ context.Context, sessionID string) error {
	if sessionID == s.principal.SessionID {
		s.revoked = true
	}
	return nil
}

func (s *fastRevokeStore) RevokeOwnSession(_ context.Context, accessToken string, sessionID string, now time.Time) (bool, error) {
	s.fastRevokeCalls += 1
	if s.revoked || accessToken != s.accessToken || sessionID != s.principal.SessionID || s.principal.ExpiresAt.Before(now) {
		return false, nil
	}
	s.revoked = true
	return true, nil
}
