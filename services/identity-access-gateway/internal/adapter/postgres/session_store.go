package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"ita-refactor/services/identity-access-gateway/internal/domain"
)

type CommandTag interface {
	RowsAffected() int64
}

type Row interface {
	Scan(dest ...any) error
}

type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (CommandTag, error)
	QueryRow(ctx context.Context, sql string, args ...any) Row
}

type SessionStore struct {
	db DB
}

func NewSessionStore(db DB) *SessionStore {
	return &SessionStore{db: db}
}

func EnsureSchema(ctx context.Context, db DB) error {
	for _, statement := range schemaStatements {
		if _, err := db.Exec(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}

func (s *SessionStore) SaveSession(ctx context.Context, accessToken string, refreshToken string, principal domain.PrincipalContext) error {
	principalJSON, err := encodePrincipal(principal)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		ctx,
		`INSERT INTO identity_sessions (
			session_id,
			access_token,
			refresh_token,
			principal_json,
			issued_at,
			expires_at,
			revoked_at
		) VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, NULL)
		ON CONFLICT (session_id) DO UPDATE SET
			access_token = EXCLUDED.access_token,
			refresh_token = EXCLUDED.refresh_token,
			principal_json = EXCLUDED.principal_json,
			issued_at = EXCLUDED.issued_at,
			expires_at = EXCLUDED.expires_at,
			revoked_at = NULL`,
		principal.SessionID,
		accessToken,
		refreshToken,
		principalJSON,
		principal.IssuedAt,
		principal.ExpiresAt,
	)
	return err
}

func (s *SessionStore) GetPrincipalByAccessToken(ctx context.Context, accessToken string) (domain.PrincipalContext, bool, error) {
	return s.getPrincipal(
		ctx,
		`SELECT principal_json
		FROM identity_sessions
		WHERE access_token = $1
			AND revoked_at IS NULL`,
		accessToken,
	)
}

func (s *SessionStore) GetPrincipalByRefreshToken(ctx context.Context, refreshToken string) (domain.PrincipalContext, bool, error) {
	return s.getPrincipal(
		ctx,
		`SELECT principal_json
		FROM identity_sessions
		WHERE refresh_token = $1
			AND revoked_at IS NULL`,
		refreshToken,
	)
}

func (s *SessionStore) RotateSession(
	ctx context.Context,
	refreshToken string,
	newAccessToken string,
	newRefreshToken string,
	principal domain.PrincipalContext,
) error {
	principalJSON, err := encodePrincipal(principal)
	if err != nil {
		return err
	}
	tag, err := s.db.Exec(
		ctx,
		`UPDATE identity_sessions
		SET access_token = $1,
			refresh_token = $2,
			principal_json = $3,
			issued_at = $4,
			expires_at = $5,
			revoked_at = NULL
		WHERE refresh_token = $6
			AND revoked_at IS NULL`,
		newAccessToken,
		newRefreshToken,
		principalJSON,
		principal.IssuedAt,
		principal.ExpiresAt,
		refreshToken,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrInvalidSession
	}
	return nil
}

func (s *SessionStore) RevokeSession(ctx context.Context, sessionID string) error {
	_, err := s.db.Exec(
		ctx,
		`UPDATE identity_sessions
		SET revoked_at = NOW()
		WHERE session_id = $1
			AND revoked_at IS NULL`,
		sessionID,
	)
	return err
}

func (s *SessionStore) RevokeOwnSession(ctx context.Context, accessToken string, sessionID string, now time.Time) (bool, error) {
	tag, err := s.db.Exec(
		ctx,
		`UPDATE identity_sessions
		SET revoked_at = NOW()
		WHERE session_id = $1
			AND access_token = $2
			AND revoked_at IS NULL
			AND expires_at >= $3`,
		sessionID,
		accessToken,
		now,
	)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (s *SessionStore) AcceptRemoteCommand(
	ctx context.Context,
	provider domain.ChannelProvider,
	externalSubjectID string,
	nonce string,
	now time.Time,
	expiresAt time.Time,
) error {
	tag, err := s.db.Exec(
		ctx,
		`INSERT INTO identity_remote_command_nonces (
			provider,
			external_subject_id,
			nonce,
			accepted_at,
			expires_at
		) VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (provider, external_subject_id, nonce) DO NOTHING`,
		string(provider),
		externalSubjectID,
		nonce,
		now,
		expiresAt,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrInvalidCredentials
	}
	return nil
}

func (s *SessionStore) getPrincipal(ctx context.Context, sql string, token string) (domain.PrincipalContext, bool, error) {
	var principalJSON []byte
	if err := s.db.QueryRow(ctx, sql, token).Scan(&principalJSON); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.PrincipalContext{}, false, nil
		}
		return domain.PrincipalContext{}, false, err
	}
	principal, err := decodePrincipal(principalJSON)
	if err != nil {
		return domain.PrincipalContext{}, false, err
	}
	return principal, true, nil
}

func encodePrincipal(principal domain.PrincipalContext) ([]byte, error) {
	return json.Marshal(principal)
}

func decodePrincipal(data []byte) (domain.PrincipalContext, error) {
	var principal domain.PrincipalContext
	if err := json.Unmarshal(data, &principal); err != nil {
		return domain.PrincipalContext{}, err
	}
	return principal, nil
}

var schemaStatements = []string{
	`CREATE TABLE IF NOT EXISTS identity_sessions (
		session_id TEXT PRIMARY KEY,
		access_token TEXT NOT NULL UNIQUE,
		refresh_token TEXT UNIQUE,
		principal_json JSONB NOT NULL,
		issued_at TIMESTAMPTZ NOT NULL,
		expires_at TIMESTAMPTZ NOT NULL,
		revoked_at TIMESTAMPTZ
	)`,
	`CREATE INDEX IF NOT EXISTS idx_identity_sessions_access_active
		ON identity_sessions (access_token)
		WHERE revoked_at IS NULL`,
	`CREATE INDEX IF NOT EXISTS idx_identity_sessions_refresh_active
		ON identity_sessions (refresh_token)
		WHERE refresh_token IS NOT NULL AND revoked_at IS NULL`,
	`CREATE INDEX IF NOT EXISTS idx_identity_sessions_expires_at
		ON identity_sessions (expires_at)`,
	`CREATE TABLE IF NOT EXISTS identity_remote_command_nonces (
		provider TEXT NOT NULL,
		external_subject_id TEXT NOT NULL,
		nonce TEXT NOT NULL,
		accepted_at TIMESTAMPTZ NOT NULL,
		expires_at TIMESTAMPTZ NOT NULL,
		PRIMARY KEY (provider, external_subject_id, nonce)
	)`,
	`CREATE INDEX IF NOT EXISTS idx_identity_remote_command_nonces_expires_at
		ON identity_remote_command_nonces (expires_at)`,
}
