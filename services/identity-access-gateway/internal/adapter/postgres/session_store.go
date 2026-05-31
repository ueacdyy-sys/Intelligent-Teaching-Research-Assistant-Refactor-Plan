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
		`,
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
		`SELECT principal_json, issued_at, expires_at
		FROM identity_sessions
		WHERE access_token = $1
			AND revoked_at IS NULL`,
		accessToken,
	)
}

func (s *SessionStore) GetPrincipalByRefreshToken(ctx context.Context, refreshToken string) (domain.PrincipalContext, bool, error) {
	return s.getPrincipal(
		ctx,
		`SELECT principal_json, issued_at, expires_at
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
	tag, err := s.db.Exec(
		ctx,
		`UPDATE identity_sessions
		SET access_token = $1,
			refresh_token = $2,
			issued_at = $3,
			expires_at = $4,
			revoked_at = NULL
		WHERE refresh_token = $5
			AND revoked_at IS NULL
			AND expires_at >= $3`,
		newAccessToken,
		newRefreshToken,
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

func (s *SessionStore) RotateRefreshSession(
	ctx context.Context,
	refreshToken string,
	newAccessToken string,
	newRefreshToken string,
	issuedAt time.Time,
	expiresAt time.Time,
) (domain.PrincipalContext, bool, error) {
	var principalJSON []byte
	var storedIssuedAt time.Time
	var storedExpiresAt time.Time
	err := s.db.QueryRow(
		ctx,
		`UPDATE identity_sessions
		SET access_token = $1,
			refresh_token = $2,
			issued_at = $3,
			expires_at = $4,
			revoked_at = NULL
		WHERE refresh_token = $5
			AND revoked_at IS NULL
			AND expires_at >= $3
		RETURNING principal_json, issued_at, expires_at`,
		newAccessToken,
		newRefreshToken,
		issuedAt,
		expiresAt,
		refreshToken,
	).Scan(&principalJSON, &storedIssuedAt, &storedExpiresAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.PrincipalContext{}, false, nil
		}
		return domain.PrincipalContext{}, false, err
	}
	principal, err := decodePrincipal(principalJSON)
	if err != nil {
		return domain.PrincipalContext{}, false, err
	}
	principal.IssuedAt = storedIssuedAt.UTC()
	principal.ExpiresAt = storedExpiresAt.UTC()
	return principal, true, nil
}

func (s *SessionStore) RevokeSession(ctx context.Context, sessionID string) error {
	_, err := s.db.Exec(
		ctx,
		`DELETE FROM identity_sessions
		WHERE session_id = $1
			AND revoked_at IS NULL`,
		sessionID,
	)
	return err
}

func (s *SessionStore) RevokeOwnSession(ctx context.Context, accessToken string, sessionID string, now time.Time) (bool, error) {
	tag, err := s.db.Exec(
		ctx,
		`DELETE FROM identity_sessions
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

func (s *SessionStore) PruneInactiveSessions(ctx context.Context, cutoff time.Time, limit int) (int64, error) {
	if limit < 1 {
		return 0, errors.New("inactive session prune limit must be positive")
	}
	tag, err := s.db.Exec(
		ctx,
		`WITH inactive_sessions AS (
			SELECT session_id
			FROM identity_sessions
			WHERE (revoked_at IS NOT NULL AND revoked_at <= $1)
				OR (revoked_at IS NULL AND expires_at <= $1)
			ORDER BY COALESCE(revoked_at, expires_at)
			LIMIT $2
		)
		DELETE FROM identity_sessions
		WHERE session_id IN (SELECT session_id FROM inactive_sessions)`,
		cutoff,
		limit,
	)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
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
	var issuedAt time.Time
	var expiresAt time.Time
	if err := s.db.QueryRow(ctx, sql, token).Scan(&principalJSON, &issuedAt, &expiresAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.PrincipalContext{}, false, nil
		}
		return domain.PrincipalContext{}, false, err
	}
	principal, err := decodePrincipal(principalJSON)
	if err != nil {
		return domain.PrincipalContext{}, false, err
	}
	principal.IssuedAt = issuedAt.UTC()
	principal.ExpiresAt = expiresAt.UTC()
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
	`DROP INDEX IF EXISTS idx_identity_sessions_access_active`,
	`DROP INDEX IF EXISTS idx_identity_sessions_refresh_active`,
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
