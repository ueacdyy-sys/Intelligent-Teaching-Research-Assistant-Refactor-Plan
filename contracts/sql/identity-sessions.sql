CREATE TABLE IF NOT EXISTS identity_sessions (
    session_id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL UNIQUE,
    refresh_token TEXT UNIQUE,
    principal_json JSONB NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

DROP INDEX IF EXISTS idx_identity_sessions_access_active;

DROP INDEX IF EXISTS idx_identity_sessions_refresh_active;

DROP INDEX IF EXISTS idx_identity_sessions_expires_at;

CREATE INDEX IF NOT EXISTS idx_identity_sessions_expires_at_brin
    ON identity_sessions USING BRIN (expires_at);

CREATE TABLE IF NOT EXISTS identity_remote_command_nonces (
    provider TEXT NOT NULL,
    external_subject_id TEXT NOT NULL,
    nonce TEXT NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (provider, external_subject_id, nonce)
);

CREATE INDEX IF NOT EXISTS idx_identity_remote_command_nonces_expires_at
    ON identity_remote_command_nonces (expires_at);
