package postgres_test

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"ita-refactor/services/identity-access-gateway/internal/adapter/postgres"
	"ita-refactor/services/identity-access-gateway/internal/domain"
)

func TestSessionStorePostgresIntegrationLifecycle(t *testing.T) {
	databaseURL := os.Getenv("IDENTITY_SESSION_INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set IDENTITY_SESSION_INTEGRATION_DATABASE_URL to run the PostgreSQL session store integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		t.Fatalf("parse integration database URL: %v", err)
	}
	config.MinConns = 0
	config.MaxConns = 2

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatalf("open integration pool: %v", err)
	}
	defer pool.Close()

	db := postgres.NewPoolDB(pool)
	if err := postgres.EnsureSchema(ctx, db); err != nil {
		t.Fatalf("ensure schema: %v", err)
	}

	store := postgres.NewSessionStore(db)
	suffix := time.Now().UTC().Format("20060102150405.000000000")
	sessionID := "sess_integration_" + suffix
	principal := teacherPrincipal(sessionID)
	principal.PrincipalID = "teacher_integration_" + suffix
	accessToken := "access_integration_" + suffix
	refreshToken := "refresh_integration_" + suffix
	newAccessToken := "access_integration_rotated_" + suffix
	newRefreshToken := "refresh_integration_rotated_" + suffix
	fastAccessToken := "access_integration_fast_rotated_" + suffix
	fastRefreshToken := "refresh_integration_fast_rotated_" + suffix
	defer func() {
		_, _ = pool.Exec(context.Background(), "DELETE FROM identity_sessions WHERE session_id = $1", sessionID)
	}()

	if err := store.SaveSession(ctx, accessToken, refreshToken, principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}
	loaded, ok, err := store.GetPrincipalByAccessToken(ctx, accessToken)
	if err != nil || !ok {
		t.Fatalf("GetPrincipalByAccessToken loaded=%#v ok=%v err=%v", loaded, ok, err)
	}
	if loaded.SessionID != sessionID || loaded.Role != domain.RoleTeacher {
		t.Fatalf("loaded principal = %#v", loaded)
	}

	principal.IssuedAt = principal.IssuedAt.Add(time.Minute)
	if err := store.RotateSession(ctx, refreshToken, newAccessToken, newRefreshToken, principal); err != nil {
		t.Fatalf("RotateSession error = %v", err)
	}
	if _, ok, err := store.GetPrincipalByAccessToken(ctx, accessToken); err != nil || ok {
		t.Fatalf("old access ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetPrincipalByRefreshToken(ctx, refreshToken); err != nil || ok {
		t.Fatalf("old refresh ok=%v err=%v", ok, err)
	}
	if loaded, ok, err := store.GetPrincipalByRefreshToken(ctx, newRefreshToken); err != nil || !ok || loaded.SessionID != sessionID {
		t.Fatalf("new refresh loaded=%#v ok=%v err=%v", loaded, ok, err)
	}

	fastIssuedAt := principal.IssuedAt.Add(2 * time.Minute)
	fastExpiresAt := fastIssuedAt.Add(time.Hour)
	fastPrincipal, ok, err := store.RotateRefreshSession(ctx, newRefreshToken, fastAccessToken, fastRefreshToken, fastIssuedAt, fastExpiresAt)
	if err != nil || !ok {
		t.Fatalf("RotateRefreshSession principal=%#v ok=%v err=%v", fastPrincipal, ok, err)
	}
	if fastPrincipal.SessionID != sessionID || !fastPrincipal.IssuedAt.Equal(fastIssuedAt) || !fastPrincipal.ExpiresAt.Equal(fastExpiresAt) {
		t.Fatalf("fast rotated principal = %#v", fastPrincipal)
	}
	if _, ok, err := store.GetPrincipalByRefreshToken(ctx, newRefreshToken); err != nil || ok {
		t.Fatalf("old fast refresh ok=%v err=%v", ok, err)
	}
	if loaded, ok, err := store.GetPrincipalByAccessToken(ctx, fastAccessToken); err != nil || !ok || loaded.SessionID != sessionID {
		t.Fatalf("fast access loaded=%#v ok=%v err=%v", loaded, ok, err)
	}

	if err := store.RevokeSession(ctx, sessionID); err != nil {
		t.Fatalf("RevokeSession error = %v", err)
	}
	if _, ok, err := store.GetPrincipalByAccessToken(ctx, fastAccessToken); err != nil || ok {
		t.Fatalf("revoked access ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.RotateRefreshSession(ctx, fastRefreshToken, "unused_access_"+suffix, "unused_refresh_"+suffix, fastIssuedAt, fastExpiresAt); err != nil || ok {
		t.Fatalf("rotating revoked fast refresh ok=%v err=%v", ok, err)
	}
	if err := store.RotateSession(ctx, fastRefreshToken, "unused_access_"+suffix, "unused_refresh_"+suffix, principal); !errors.Is(err, domain.ErrInvalidSession) {
		t.Fatalf("rotating revoked refresh err = %v", err)
	}
}
