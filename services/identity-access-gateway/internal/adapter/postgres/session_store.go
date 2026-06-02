package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"ita-refactor/services/identity-access-gateway/internal/domain"
	"ita-refactor/services/identity-access-gateway/internal/platform"
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
	db                            DB
	operationTimings              map[sessionOperation]*sessionOperationTimingStats
	writeLimiter                  chan struct{}
	writeConcurrencyLimit         int
	writeOperations               map[sessionWriteOperation]*sessionWriteLimiterOperationStats
	writeLimiterWaiting           atomic.Int64
	writeLimiterAcquireCount      atomic.Int64
	writeLimiterAcquireWaitNanos  atomic.Int64
	writeLimiterCanceledCount     atomic.Int64
	writeLimiterCanceledWaitNanos atomic.Int64
}

type SessionStoreConfig struct {
	WriteConcurrency int
}

type SessionTablePersistence string

const (
	SessionTablePersistenceLogged   SessionTablePersistence = "logged"
	SessionTablePersistenceUnlogged SessionTablePersistence = "unlogged"
)

type SchemaConfig struct {
	SessionTablePersistence SessionTablePersistence
}

type sessionWriteOperation string
type sessionOperation string

const (
	writeOperationSaveSession          sessionWriteOperation = "saveSession"
	writeOperationRotateSession        sessionWriteOperation = "rotateSession"
	writeOperationRotateRefreshSession sessionWriteOperation = "rotateRefreshSession"
	writeOperationRevokeSession        sessionWriteOperation = "revokeSession"
	writeOperationRevokeOwnSession     sessionWriteOperation = "revokeOwnSession"
	writeOperationPruneInactive        sessionWriteOperation = "pruneInactiveSessions"
	writeOperationAcceptRemoteCommand  sessionWriteOperation = "acceptRemoteCommand"
)

const (
	operationGetPrincipalByAccessToken  sessionOperation = "getPrincipalByAccessToken"
	operationGetPrincipalByRefreshToken sessionOperation = "getPrincipalByRefreshToken"
)

var sessionWriteOperations = []sessionWriteOperation{
	writeOperationSaveSession,
	writeOperationRotateSession,
	writeOperationRotateRefreshSession,
	writeOperationRevokeSession,
	writeOperationRevokeOwnSession,
	writeOperationPruneInactive,
	writeOperationAcceptRemoteCommand,
}

var sessionOperations = []sessionOperation{
	sessionOperation(writeOperationSaveSession),
	operationGetPrincipalByAccessToken,
	operationGetPrincipalByRefreshToken,
	sessionOperation(writeOperationRotateSession),
	sessionOperation(writeOperationRotateRefreshSession),
	sessionOperation(writeOperationRevokeSession),
	sessionOperation(writeOperationRevokeOwnSession),
	sessionOperation(writeOperationPruneInactive),
	sessionOperation(writeOperationAcceptRemoteCommand),
}

type sessionWriteLimiterOperationStats struct {
	waiting                  atomic.Int64
	acquireCount             atomic.Int64
	acquireWaitNanos         atomic.Int64
	canceledAcquireCount     atomic.Int64
	canceledAcquireWaitNanos atomic.Int64
}

type sessionOperationTimingStats struct {
	count             atomic.Int64
	totalElapsedNanos atomic.Int64
	maxElapsedNanos   atomic.Int64
}

func NewSessionStore(db DB) *SessionStore {
	return NewSessionStoreWithConfig(db, SessionStoreConfig{})
}

func NewSessionStoreWithConfig(db DB, config SessionStoreConfig) *SessionStore {
	store := &SessionStore{
		db:               db,
		operationTimings: newSessionOperationTimingStats(),
	}
	if config.WriteConcurrency > 0 {
		store.writeLimiter = make(chan struct{}, config.WriteConcurrency)
		store.writeConcurrencyLimit = config.WriteConcurrency
		store.writeOperations = newSessionWriteOperationStats()
	}
	return store
}

func EnsureSchema(ctx context.Context, db DB) error {
	return EnsureSchemaWithConfig(ctx, db, SchemaConfig{})
}

func EnsureSchemaWithConfig(ctx context.Context, db DB, config SchemaConfig) error {
	for _, statement := range schemaStatementsFor(config.normalizedSessionTablePersistence()) {
		if err := execSchemaStatement(ctx, db, statement); err != nil {
			return err
		}
	}
	return nil
}

func (config SchemaConfig) normalizedSessionTablePersistence() SessionTablePersistence {
	if config.SessionTablePersistence == SessionTablePersistenceUnlogged {
		return SessionTablePersistenceUnlogged
	}
	return SessionTablePersistenceLogged
}

func execSchemaStatement(ctx context.Context, db DB, statement string) error {
	const maxAttempts = 6
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if _, err := db.Exec(ctx, statement); err != nil {
			if !isConcurrentSchemaDDLError(err) || attempt == maxAttempts-1 {
				return err
			}
			if waitErr := waitForSchemaRetry(ctx, attempt); waitErr != nil {
				return waitErr
			}
			continue
		}
		return nil
	}
	return nil
}

func isConcurrentSchemaDDLError(err error) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return false
	}
	switch pgErr.Code {
	case "23505", "42P07", "42710":
		return true
	default:
		return false
	}
}

func waitForSchemaRetry(ctx context.Context, attempt int) error {
	delay := time.Duration(10*(1<<attempt)) * time.Millisecond
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (s *SessionStore) SaveSession(ctx context.Context, accessToken string, refreshToken string, principal domain.PrincipalContext) error {
	principalJSON, err := encodePrincipal(principal)
	if err != nil {
		return err
	}
	release, err := s.acquireWriteSlot(ctx, writeOperationSaveSession)
	if err != nil {
		return err
	}
	defer release()
	startedAt := time.Now()
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
	s.recordSessionOperation(sessionOperation(writeOperationSaveSession), startedAt)
	return err
}

func (s *SessionStore) GetPrincipalByAccessToken(ctx context.Context, accessToken string) (domain.PrincipalContext, bool, error) {
	return s.getPrincipal(
		ctx,
		operationGetPrincipalByAccessToken,
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
		operationGetPrincipalByRefreshToken,
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
	release, err := s.acquireWriteSlot(ctx, writeOperationRotateSession)
	if err != nil {
		return err
	}
	defer release()
	startedAt := time.Now()
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
	s.recordSessionOperation(sessionOperation(writeOperationRotateSession), startedAt)
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
	release, err := s.acquireWriteSlot(ctx, writeOperationRotateRefreshSession)
	if err != nil {
		return domain.PrincipalContext{}, false, err
	}
	defer release()
	var principalJSON []byte
	var storedIssuedAt time.Time
	var storedExpiresAt time.Time
	startedAt := time.Now()
	err = s.db.QueryRow(
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
	s.recordSessionOperation(sessionOperation(writeOperationRotateRefreshSession), startedAt)
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
	release, err := s.acquireWriteSlot(ctx, writeOperationRevokeSession)
	if err != nil {
		return err
	}
	defer release()
	startedAt := time.Now()
	_, err = s.db.Exec(
		ctx,
		`DELETE FROM identity_sessions
		WHERE session_id = $1
			AND revoked_at IS NULL`,
		sessionID,
	)
	s.recordSessionOperation(sessionOperation(writeOperationRevokeSession), startedAt)
	return err
}

func (s *SessionStore) RevokeOwnSession(ctx context.Context, accessToken string, sessionID string, now time.Time) (bool, error) {
	release, err := s.acquireWriteSlot(ctx, writeOperationRevokeOwnSession)
	if err != nil {
		return false, err
	}
	defer release()
	startedAt := time.Now()
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
	s.recordSessionOperation(sessionOperation(writeOperationRevokeOwnSession), startedAt)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (s *SessionStore) PruneInactiveSessions(ctx context.Context, cutoff time.Time, limit int) (int64, error) {
	if limit < 1 {
		return 0, errors.New("inactive session prune limit must be positive")
	}
	release, err := s.acquireWriteSlot(ctx, writeOperationPruneInactive)
	if err != nil {
		return 0, err
	}
	defer release()
	startedAt := time.Now()
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
	s.recordSessionOperation(sessionOperation(writeOperationPruneInactive), startedAt)
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
	release, err := s.acquireWriteSlot(ctx, writeOperationAcceptRemoteCommand)
	if err != nil {
		return err
	}
	defer release()
	startedAt := time.Now()
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
	s.recordSessionOperation(sessionOperation(writeOperationAcceptRemoteCommand), startedAt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrInvalidCredentials
	}
	return nil
}

func (s *SessionStore) acquireWriteSlot(ctx context.Context, operation sessionWriteOperation) (func(), error) {
	if s.writeLimiter == nil {
		return func() {}, nil
	}
	startedAt := time.Now()
	operationStats := s.writeOperations[operation]
	s.writeLimiterWaiting.Add(1)
	if operationStats != nil {
		operationStats.waiting.Add(1)
	}
	defer s.writeLimiterWaiting.Add(-1)
	defer func() {
		if operationStats != nil {
			operationStats.waiting.Add(-1)
		}
	}()
	select {
	case s.writeLimiter <- struct{}{}:
		waitNanos := time.Since(startedAt).Nanoseconds()
		s.writeLimiterAcquireCount.Add(1)
		s.writeLimiterAcquireWaitNanos.Add(waitNanos)
		if operationStats != nil {
			operationStats.acquireCount.Add(1)
			operationStats.acquireWaitNanos.Add(waitNanos)
		}
		return func() { <-s.writeLimiter }, nil
	case <-ctx.Done():
		waitNanos := time.Since(startedAt).Nanoseconds()
		s.writeLimiterCanceledCount.Add(1)
		s.writeLimiterCanceledWaitNanos.Add(waitNanos)
		if operationStats != nil {
			operationStats.canceledAcquireCount.Add(1)
			operationStats.canceledAcquireWaitNanos.Add(waitNanos)
		}
		return nil, ctx.Err()
	}
}

func (s *SessionStore) SessionWriteLimiterStats() platform.SessionWriteLimiterStats {
	if s.writeLimiter == nil {
		return platform.SessionWriteLimiterStats{}
	}
	return platform.SessionWriteLimiterStats{
		Enabled:                   true,
		Limit:                     s.writeConcurrencyLimit,
		InUse:                     len(s.writeLimiter),
		Waiting:                   s.writeLimiterWaiting.Load(),
		AcquireCount:              s.writeLimiterAcquireCount.Load(),
		AcquireWaitTimeMs:         float64(s.writeLimiterAcquireWaitNanos.Load()) / 1_000_000,
		CanceledAcquireCount:      s.writeLimiterCanceledCount.Load(),
		CanceledAcquireWaitTimeMs: float64(s.writeLimiterCanceledWaitNanos.Load()) / 1_000_000,
		Operations:                s.sessionWriteOperationStats(),
	}
}

func newSessionWriteOperationStats() map[sessionWriteOperation]*sessionWriteLimiterOperationStats {
	stats := make(map[sessionWriteOperation]*sessionWriteLimiterOperationStats, len(sessionWriteOperations))
	for _, operation := range sessionWriteOperations {
		stats[operation] = &sessionWriteLimiterOperationStats{}
	}
	return stats
}

func newSessionOperationTimingStats() map[sessionOperation]*sessionOperationTimingStats {
	stats := make(map[sessionOperation]*sessionOperationTimingStats, len(sessionOperations))
	for _, operation := range sessionOperations {
		stats[operation] = &sessionOperationTimingStats{}
	}
	return stats
}

func (s *SessionStore) sessionWriteOperationStats() map[string]platform.SessionWriteLimiterOperationStat {
	if len(s.writeOperations) == 0 {
		return nil
	}
	stats := make(map[string]platform.SessionWriteLimiterOperationStat, len(s.writeOperations))
	for _, operation := range sessionWriteOperations {
		operationStats := s.writeOperations[operation]
		if operationStats == nil {
			continue
		}
		stats[string(operation)] = platform.SessionWriteLimiterOperationStat{
			Waiting:                   operationStats.waiting.Load(),
			AcquireCount:              operationStats.acquireCount.Load(),
			AcquireWaitTimeMs:         float64(operationStats.acquireWaitNanos.Load()) / 1_000_000,
			CanceledAcquireCount:      operationStats.canceledAcquireCount.Load(),
			CanceledAcquireWaitTimeMs: float64(operationStats.canceledAcquireWaitNanos.Load()) / 1_000_000,
		}
	}
	return stats
}

func (s *SessionStore) SessionOperationTimingStats() map[string]platform.SessionOperationTimingStat {
	if len(s.operationTimings) == 0 {
		return nil
	}
	stats := make(map[string]platform.SessionOperationTimingStat, len(s.operationTimings))
	for _, operation := range sessionOperations {
		operationStats := s.operationTimings[operation]
		if operationStats == nil {
			continue
		}
		count := operationStats.count.Load()
		totalElapsedMs := nanosToMillis(operationStats.totalElapsedNanos.Load())
		var averageElapsedMs float64
		if count > 0 {
			averageElapsedMs = totalElapsedMs / float64(count)
		}
		stats[string(operation)] = platform.SessionOperationTimingStat{
			Count:            count,
			TotalElapsedMs:   totalElapsedMs,
			AverageElapsedMs: averageElapsedMs,
			MaxElapsedMs:     nanosToMillis(operationStats.maxElapsedNanos.Load()),
		}
	}
	return stats
}

func (s *SessionStore) recordSessionOperation(operation sessionOperation, startedAt time.Time) {
	if len(s.operationTimings) == 0 {
		return
	}
	operationStats := s.operationTimings[operation]
	if operationStats == nil {
		return
	}
	elapsedNanos := time.Since(startedAt).Nanoseconds()
	operationStats.count.Add(1)
	operationStats.totalElapsedNanos.Add(elapsedNanos)
	for {
		current := operationStats.maxElapsedNanos.Load()
		if elapsedNanos <= current || operationStats.maxElapsedNanos.CompareAndSwap(current, elapsedNanos) {
			return
		}
	}
}

func nanosToMillis(nanos int64) float64 {
	return float64(nanos) / 1_000_000
}

func (s *SessionStore) getPrincipal(
	ctx context.Context,
	operation sessionOperation,
	sql string,
	token string,
) (domain.PrincipalContext, bool, error) {
	var principalJSON []byte
	var issuedAt time.Time
	var expiresAt time.Time
	startedAt := time.Now()
	if err := s.db.QueryRow(ctx, sql, token).Scan(&principalJSON, &issuedAt, &expiresAt); err != nil {
		s.recordSessionOperation(operation, startedAt)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.PrincipalContext{}, false, nil
		}
		return domain.PrincipalContext{}, false, err
	}
	s.recordSessionOperation(operation, startedAt)
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

func schemaStatementsFor(persistence SessionTablePersistence) []string {
	createStatement := createLoggedIdentitySessionsStatement
	persistenceStatement := ensureLoggedIdentitySessionsStatement
	if persistence == SessionTablePersistenceUnlogged {
		createStatement = createUnloggedIdentitySessionsStatement
		persistenceStatement = ensureUnloggedIdentitySessionsStatement
	}

	statements := make([]string, 0, len(schemaStatementsAfterIdentitySessions)+2)
	statements = append(statements, createStatement, persistenceStatement)
	statements = append(statements, schemaStatementsAfterIdentitySessions...)
	return statements
}

const createLoggedIdentitySessionsStatement = `CREATE TABLE IF NOT EXISTS identity_sessions (
		session_id TEXT PRIMARY KEY,
		access_token TEXT NOT NULL UNIQUE,
		refresh_token TEXT UNIQUE,
		principal_json JSONB NOT NULL,
		issued_at TIMESTAMPTZ NOT NULL,
		expires_at TIMESTAMPTZ NOT NULL,
		revoked_at TIMESTAMPTZ
	)`

const createUnloggedIdentitySessionsStatement = `CREATE UNLOGGED TABLE IF NOT EXISTS identity_sessions (
		session_id TEXT PRIMARY KEY,
		access_token TEXT NOT NULL UNIQUE,
		refresh_token TEXT UNIQUE,
		principal_json JSONB NOT NULL,
		issued_at TIMESTAMPTZ NOT NULL,
		expires_at TIMESTAMPTZ NOT NULL,
		revoked_at TIMESTAMPTZ
	)`

const ensureLoggedIdentitySessionsStatement = `DO $$
	BEGIN
		IF EXISTS (
			SELECT 1
			FROM pg_class
			WHERE oid = 'identity_sessions'::regclass
				AND relpersistence <> 'p'
		) THEN
			ALTER TABLE identity_sessions SET LOGGED;
		END IF;
	END $$`

const ensureUnloggedIdentitySessionsStatement = `DO $$
	BEGIN
		IF EXISTS (
			SELECT 1
			FROM pg_class
			WHERE oid = 'identity_sessions'::regclass
				AND relpersistence <> 'u'
		) THEN
			ALTER TABLE identity_sessions SET UNLOGGED;
		END IF;
	END $$`

var schemaStatementsAfterIdentitySessions = []string{
	`DROP INDEX IF EXISTS idx_identity_sessions_access_active`,
	`DROP INDEX IF EXISTS idx_identity_sessions_refresh_active`,
	`DROP INDEX IF EXISTS idx_identity_sessions_expires_at`,
	`CREATE INDEX IF NOT EXISTS idx_identity_sessions_expires_at_brin
		ON identity_sessions USING BRIN (expires_at)`,
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
