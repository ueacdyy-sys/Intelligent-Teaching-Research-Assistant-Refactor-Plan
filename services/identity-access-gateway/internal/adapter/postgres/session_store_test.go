package postgres_test

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"ita-refactor/services/identity-access-gateway/internal/adapter/postgres"
	"ita-refactor/services/identity-access-gateway/internal/domain"
)

func TestSessionStoreSavesAndLoadsByAccessToken(t *testing.T) {
	db := newFakeDB()
	store := postgres.NewSessionStore(db)
	principal := teacherPrincipal("sess_1")

	if err := store.SaveSession(context.Background(), "access_1", "refresh_1", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}

	loaded, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_1")
	if err != nil {
		t.Fatalf("GetPrincipalByAccessToken error = %v", err)
	}
	if !ok {
		t.Fatal("principal not found by access token")
	}
	if loaded.SessionID != "sess_1" || loaded.Role != domain.RoleTeacher {
		t.Fatalf("loaded principal = %#v", loaded)
	}
	if !strings.Contains(db.execSQL[0], "INSERT INTO identity_sessions") {
		t.Fatalf("insert SQL = %s", db.execSQL[0])
	}
}

func TestSessionStoreLoadsByRefreshToken(t *testing.T) {
	db := newFakeDB()
	store := postgres.NewSessionStore(db)
	principal := teacherPrincipal("sess_1")
	if err := store.SaveSession(context.Background(), "access_1", "refresh_1", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}

	loaded, ok, err := store.GetPrincipalByRefreshToken(context.Background(), "refresh_1")
	if err != nil {
		t.Fatalf("GetPrincipalByRefreshToken error = %v", err)
	}
	if !ok || loaded.SessionID != "sess_1" {
		t.Fatalf("loaded = %#v ok=%v", loaded, ok)
	}
}

func TestSessionStoreRotatesTokensAndInvalidatesOldTokens(t *testing.T) {
	db := newFakeDB()
	store := postgres.NewSessionStore(db)
	principal := teacherPrincipal("sess_1")
	if err := store.SaveSession(context.Background(), "access_1", "refresh_1", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}
	principal.IssuedAt = principal.IssuedAt.Add(time.Minute)

	if err := store.RotateSession(context.Background(), "refresh_1", "access_2", "refresh_2", principal); err != nil {
		t.Fatalf("RotateSession error = %v", err)
	}
	if !strings.Contains(db.execSQL[len(db.execSQL)-1], "AND expires_at >= $3") {
		t.Fatalf("RotateSession SQL must reject expired refresh tokens atomically: %s", db.execSQL[len(db.execSQL)-1])
	}

	if _, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_1"); err != nil || ok {
		t.Fatalf("old access ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetPrincipalByRefreshToken(context.Background(), "refresh_1"); err != nil || ok {
		t.Fatalf("old refresh ok=%v err=%v", ok, err)
	}
	if loaded, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_2"); err != nil || !ok || loaded.SessionID != "sess_1" {
		t.Fatalf("new access loaded=%#v ok=%v err=%v", loaded, ok, err)
	}
	rotatedRefresh, ok, err := store.GetPrincipalByRefreshToken(context.Background(), "refresh_2")
	if err != nil || !ok || rotatedRefresh.SessionID != "sess_1" {
		t.Fatalf("rotated refresh loaded=%#v ok=%v err=%v", rotatedRefresh, ok, err)
	}
	if !rotatedRefresh.IssuedAt.Equal(principal.IssuedAt) || !rotatedRefresh.ExpiresAt.Equal(principal.ExpiresAt) {
		t.Fatalf("rotated principal times = issued=%s expires=%s", rotatedRefresh.IssuedAt, rotatedRefresh.ExpiresAt)
	}
}

func TestSessionStoreRotateSessionRejectsExpiredRefreshTokenAtomically(t *testing.T) {
	db := newFakeDB()
	store := postgres.NewSessionStore(db)
	principal := teacherPrincipal("sess_1")
	if err := store.SaveSession(context.Background(), "access_1", "refresh_1", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}
	rotatedPrincipal := principal
	rotatedPrincipal.IssuedAt = principal.ExpiresAt.Add(time.Nanosecond)
	rotatedPrincipal.ExpiresAt = rotatedPrincipal.IssuedAt.Add(time.Hour)

	err := store.RotateSession(context.Background(), "refresh_1", "access_2", "refresh_2", rotatedPrincipal)

	if !errors.Is(err, domain.ErrInvalidSession) {
		t.Fatalf("err = %v", err)
	}
	if !strings.Contains(db.execSQL[len(db.execSQL)-1], "AND expires_at >= $3") {
		t.Fatalf("RotateSession SQL must keep the expiry guard: %s", db.execSQL[len(db.execSQL)-1])
	}
	if loaded, ok, err := store.GetPrincipalByRefreshToken(context.Background(), "refresh_1"); err != nil || !ok || loaded.SessionID != "sess_1" {
		t.Fatalf("original refresh loaded=%#v ok=%v err=%v", loaded, ok, err)
	}
}

func TestSessionStoreRotateRefreshSessionReturnsUpdatedPrincipal(t *testing.T) {
	db := newFakeDB()
	store := postgres.NewSessionStore(db)
	principal := teacherPrincipal("sess_1")
	if err := store.SaveSession(context.Background(), "access_1", "refresh_1", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}
	issuedAt := principal.IssuedAt.Add(time.Minute)
	expiresAt := issuedAt.Add(time.Hour)

	rotated, ok, err := store.RotateRefreshSession(context.Background(), "refresh_1", "access_2", "refresh_2", issuedAt, expiresAt)
	if err != nil {
		t.Fatalf("RotateRefreshSession error = %v", err)
	}

	if !ok {
		t.Fatal("RotateRefreshSession did not rotate matching refresh token")
	}
	if rotated.SessionID != "sess_1" || !rotated.IssuedAt.Equal(issuedAt) || !rotated.ExpiresAt.Equal(expiresAt) {
		t.Fatalf("rotated principal = %#v", rotated)
	}
	if _, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_1"); err != nil || ok {
		t.Fatalf("old access ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetPrincipalByRefreshToken(context.Background(), "refresh_1"); err != nil || ok {
		t.Fatalf("old refresh ok=%v err=%v", ok, err)
	}
	loadedRefresh, ok, err := store.GetPrincipalByRefreshToken(context.Background(), "refresh_2")
	if err != nil || !ok || loadedRefresh.SessionID != "sess_1" {
		t.Fatalf("new refresh loaded=%#v ok=%v err=%v", loadedRefresh, ok, err)
	}
	if !queryLogContains(db.querySQL, "UPDATE identity_sessions", "RETURNING principal_json") {
		t.Fatalf("optimized refresh SQL should return the updated principal: %#v", db.querySQL)
	}
}

func TestSessionStoreRevokeInvalidatesTokens(t *testing.T) {
	db := newFakeDB()
	store := postgres.NewSessionStore(db)
	principal := teacherPrincipal("sess_1")
	if err := store.SaveSession(context.Background(), "access_1", "refresh_1", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}

	if err := store.RevokeSession(context.Background(), "sess_1"); err != nil {
		t.Fatalf("RevokeSession error = %v", err)
	}

	if _, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_1"); err != nil || ok {
		t.Fatalf("revoked access ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetPrincipalByRefreshToken(context.Background(), "refresh_1"); err != nil || ok {
		t.Fatalf("revoked refresh ok=%v err=%v", ok, err)
	}
	if !strings.Contains(db.execSQL[len(db.execSQL)-1], "DELETE FROM identity_sessions") {
		t.Fatalf("revoke SQL should delete inactive rows, got %s", db.execSQL[len(db.execSQL)-1])
	}
}

func TestSessionStoreRevokeOwnSessionUsesAccessAndSessionCondition(t *testing.T) {
	db := newFakeDB()
	store := postgres.NewSessionStore(db)
	principal := teacherPrincipal("sess_1")
	if err := store.SaveSession(context.Background(), "access_1", "refresh_1", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}

	revoked, err := store.RevokeOwnSession(context.Background(), "access_1", "sess_1", principal.IssuedAt)
	if err != nil {
		t.Fatalf("RevokeOwnSession error = %v", err)
	}

	if !revoked {
		t.Fatal("RevokeOwnSession did not revoke matching session")
	}
	if _, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_1"); err != nil || ok {
		t.Fatalf("revoked access ok=%v err=%v", ok, err)
	}
	if !strings.Contains(db.execSQL[len(db.execSQL)-1], "DELETE FROM identity_sessions") ||
		!strings.Contains(db.execSQL[len(db.execSQL)-1], "session_id = $1") ||
		!strings.Contains(db.execSQL[len(db.execSQL)-1], "access_token = $2") {
		t.Fatalf("fast revoke SQL = %s", db.execSQL[len(db.execSQL)-1])
	}
}

func TestSessionStoreRevokeOwnSessionRejectsMismatchedAccessToken(t *testing.T) {
	db := newFakeDB()
	store := postgres.NewSessionStore(db)
	principal := teacherPrincipal("sess_1")
	if err := store.SaveSession(context.Background(), "access_1", "refresh_1", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}

	revoked, err := store.RevokeOwnSession(context.Background(), "access_other", "sess_1", principal.IssuedAt)
	if err != nil {
		t.Fatalf("RevokeOwnSession error = %v", err)
	}

	if revoked {
		t.Fatal("mismatched access token revoked the session")
	}
	if _, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_1"); err != nil || !ok {
		t.Fatalf("active access ok=%v err=%v", ok, err)
	}
}

func TestSessionStorePrunesInactiveSessions(t *testing.T) {
	db := newFakeDB()
	store := postgres.NewSessionStore(db)
	cutoff := time.Date(2026, 5, 28, 10, 0, 0, 0, time.UTC)

	revoked := teacherPrincipal("sess_revoked")
	revoked.ExpiresAt = cutoff.Add(time.Hour)
	if err := store.SaveSession(context.Background(), "access_revoked", "refresh_revoked", revoked); err != nil {
		t.Fatalf("SaveSession revoked error = %v", err)
	}
	db.markRevokedAt("sess_revoked", cutoff.Add(-time.Minute))

	futureRevoked := teacherPrincipal("sess_future_revoked")
	futureRevoked.ExpiresAt = cutoff.Add(time.Hour)
	if err := store.SaveSession(context.Background(), "access_future_revoked", "refresh_future_revoked", futureRevoked); err != nil {
		t.Fatalf("SaveSession future revoked error = %v", err)
	}
	db.markRevokedAt("sess_future_revoked", cutoff.Add(time.Minute))

	expired := teacherPrincipal("sess_expired")
	expired.ExpiresAt = cutoff.Add(-time.Minute)
	if err := store.SaveSession(context.Background(), "access_expired", "refresh_expired", expired); err != nil {
		t.Fatalf("SaveSession expired error = %v", err)
	}

	active := teacherPrincipal("sess_active")
	active.ExpiresAt = cutoff.Add(time.Hour)
	if err := store.SaveSession(context.Background(), "access_active", "refresh_active", active); err != nil {
		t.Fatalf("SaveSession active error = %v", err)
	}

	pruned, err := store.PruneInactiveSessions(context.Background(), cutoff, 10)
	if err != nil {
		t.Fatalf("PruneInactiveSessions error = %v", err)
	}

	if pruned != 2 {
		t.Fatalf("pruned = %d want 2", pruned)
	}
	if _, ok := db.sessionsByID["sess_revoked"]; ok {
		t.Fatal("revoked session was not pruned")
	}
	if _, ok := db.sessionsByID["sess_expired"]; ok {
		t.Fatal("expired session was not pruned")
	}
	if _, ok := db.sessionsByID["sess_active"]; !ok {
		t.Fatal("unexpired active session was pruned")
	}
	if _, ok := db.sessionsByID["sess_future_revoked"]; !ok {
		t.Fatal("future revoked session was pruned")
	}
	lastSQL := db.execSQL[len(db.execSQL)-1]
	if !strings.Contains(lastSQL, "revoked_at IS NOT NULL") || !strings.Contains(lastSQL, "revoked_at <= $1") || !strings.Contains(lastSQL, "expires_at <= $1") || !strings.Contains(lastSQL, "LIMIT $2") {
		t.Fatalf("prune SQL = %s", lastSQL)
	}
}

func TestSessionStorePruneInactiveSessionsRejectsInvalidLimit(t *testing.T) {
	db := newFakeDB()
	store := postgres.NewSessionStore(db)

	pruned, err := store.PruneInactiveSessions(context.Background(), time.Now(), 0)

	if err == nil {
		t.Fatal("PruneInactiveSessions accepted an invalid limit")
	}
	if pruned != 0 {
		t.Fatalf("pruned = %d want 0", pruned)
	}
	if len(db.execSQL) != 0 {
		t.Fatalf("invalid prune executed SQL: %v", db.execSQL)
	}
}

func TestEnsureSchemaDropsRedundantActiveTokenIndexes(t *testing.T) {
	db := newFakeDB()

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema error = %v", err)
	}

	schemaSQL := strings.Join(db.execSQL, "\n")
	for _, indexName := range []string{
		"idx_identity_sessions_access_active",
		"idx_identity_sessions_refresh_active",
	} {
		if !strings.Contains(schemaSQL, "DROP INDEX IF EXISTS "+indexName) {
			t.Fatalf("schema did not drop redundant index %s:\n%s", indexName, schemaSQL)
		}
		if strings.Contains(schemaSQL, "CREATE INDEX IF NOT EXISTS "+indexName) {
			t.Fatalf("schema still recreates redundant index %s:\n%s", indexName, schemaSQL)
		}
	}
	if !strings.Contains(schemaSQL, "access_token TEXT NOT NULL UNIQUE") {
		t.Fatalf("schema must keep access_token uniqueness:\n%s", schemaSQL)
	}
	if !strings.Contains(schemaSQL, "refresh_token TEXT UNIQUE") {
		t.Fatalf("schema must keep refresh_token uniqueness:\n%s", schemaSQL)
	}
}

func TestSessionStoreAcceptRemoteCommandRejectsReplayNonce(t *testing.T) {
	db := newFakeDB()
	store := postgres.NewSessionStore(db)
	now := time.Date(2026, 5, 28, 8, 0, 0, 0, time.UTC)

	err := store.AcceptRemoteCommand(
		context.Background(),
		domain.ChannelProviderWeChat,
		"openid",
		"nonce-123",
		now,
		now.Add(10*time.Minute),
	)
	if err != nil {
		t.Fatalf("AcceptRemoteCommand first error = %v", err)
	}

	err = store.AcceptRemoteCommand(
		context.Background(),
		domain.ChannelProviderWeChat,
		"openid",
		"nonce-123",
		now,
		now.Add(10*time.Minute),
	)

	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatalf("replay err = %v", err)
	}
	if !strings.Contains(db.execSQL[len(db.execSQL)-1], "identity_remote_command_nonces") {
		t.Fatalf("remote replay SQL = %s", db.execSQL[len(db.execSQL)-1])
	}
}

func TestSessionStoreRotateMissingRefreshReturnsInvalidSession(t *testing.T) {
	store := postgres.NewSessionStore(newFakeDB())
	err := store.RotateSession(context.Background(), "missing", "access_2", "refresh_2", teacherPrincipal("sess_1"))

	if !errors.Is(err, domain.ErrInvalidSession) {
		t.Fatalf("err = %v", err)
	}
}

func teacherPrincipal(sessionID string) domain.PrincipalContext {
	now := time.Date(2026, 5, 28, 8, 0, 0, 0, time.UTC)
	return domain.PrincipalContext{
		PrincipalID:     "user_teacher",
		SubjectType:     domain.SubjectUser,
		Role:            domain.RoleTeacher,
		EntryPoint:      domain.EntryPointDesktopTeacher,
		DisplayName:     "Teacher",
		Scopes:          []domain.Scope{domain.ScopeIdentityRead, domain.ScopeTeachingRead},
		KnowledgeAccess: domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessAssigned},
		StudentAccess:   domain.StudentAccess{Mode: domain.StudentAccessAssigned},
		SessionID:       sessionID,
		IssuedAt:        now,
		ExpiresAt:       now.Add(time.Hour),
	}
}

type fakeDB struct {
	sessionsByID        map[string]fakeSession
	sessionByAccess     map[string]string
	sessionByRefresh    map[string]string
	remoteCommandNonces map[string]time.Time
	execSQL             []string
	querySQL            []string
}

type fakeSession struct {
	accessToken   string
	refreshToken  string
	principalJSON []byte
	issuedAt      time.Time
	expiresAt     time.Time
	revoked       bool
	revokedAt     time.Time
}

func newFakeDB() *fakeDB {
	return &fakeDB{
		sessionsByID:        map[string]fakeSession{},
		sessionByAccess:     map[string]string{},
		sessionByRefresh:    map[string]string{},
		remoteCommandNonces: map[string]time.Time{},
	}
}

func (db *fakeDB) Exec(_ context.Context, sql string, args ...any) (postgres.CommandTag, error) {
	db.execSQL = append(db.execSQL, sql)
	switch {
	case strings.Contains(sql, "INSERT INTO identity_remote_command_nonces"):
		key := args[0].(string) + "\x00" + args[1].(string) + "\x00" + args[2].(string)
		if _, ok := db.remoteCommandNonces[key]; ok {
			return fakeCommandTag{rows: 0}, nil
		}
		db.remoteCommandNonces[key] = args[4].(time.Time)
		return fakeCommandTag{rows: 1}, nil
	case strings.Contains(sql, "INSERT INTO identity_sessions"):
		sessionID := args[0].(string)
		accessToken := args[1].(string)
		refreshToken, _ := args[2].(string)
		principalJSON := append([]byte(nil), args[3].([]byte)...)
		principal := decodePrincipalOrFail(principalJSON)
		db.removeIndexes(sessionID)
		db.sessionsByID[sessionID] = fakeSession{
			accessToken:   accessToken,
			refreshToken:  refreshToken,
			principalJSON: principalJSON,
			issuedAt:      principal.IssuedAt,
			expiresAt:     principal.ExpiresAt,
		}
		db.sessionByAccess[accessToken] = sessionID
		if refreshToken != "" {
			db.sessionByRefresh[refreshToken] = sessionID
		}
		return fakeCommandTag{rows: 1}, nil
	case strings.Contains(sql, "WHERE refresh_token ="):
		newAccess := args[0].(string)
		newRefresh := args[1].(string)
		issuedAt := args[2].(time.Time)
		expiresAt := args[3].(time.Time)
		oldRefresh := args[4].(string)
		sessionID := db.sessionByRefresh[oldRefresh]
		session := db.sessionsByID[sessionID]
		if sessionID == "" || session.revoked {
			return fakeCommandTag{rows: 0}, nil
		}
		if session.expiresAt.Before(issuedAt) {
			return fakeCommandTag{rows: 0}, nil
		}
		db.removeIndexes(sessionID)
		session.accessToken = newAccess
		session.refreshToken = newRefresh
		session.issuedAt = issuedAt
		session.expiresAt = expiresAt
		session.revoked = false
		db.sessionsByID[sessionID] = session
		db.sessionByAccess[newAccess] = sessionID
		db.sessionByRefresh[newRefresh] = sessionID
		return fakeCommandTag{rows: 1}, nil
	case strings.Contains(sql, "DELETE FROM identity_sessions") && strings.Contains(sql, "access_token = $2"):
		sessionID := args[0].(string)
		accessToken := args[1].(string)
		now := args[2].(time.Time)
		session, ok := db.sessionsByID[sessionID]
		if !ok || session.revoked || session.accessToken != accessToken {
			return fakeCommandTag{rows: 0}, nil
		}
		if session.expiresAt.Before(now) {
			return fakeCommandTag{rows: 0}, nil
		}
		db.deleteSession(sessionID)
		return fakeCommandTag{rows: 1}, nil
	case strings.Contains(sql, "WITH inactive_sessions AS"):
		cutoff := args[0].(time.Time)
		limit := args[1].(int)
		var rows int64
		for sessionID, session := range db.sessionsByID {
			if int(rows) >= limit {
				break
			}
			revokedBeforeCutoff := session.revoked && (session.revokedAt.IsZero() || !session.revokedAt.After(cutoff))
			expiredActive := !session.revoked && !session.expiresAt.After(cutoff)
			if revokedBeforeCutoff || expiredActive {
				db.deleteSession(sessionID)
				rows++
			}
		}
		return fakeCommandTag{rows: rows}, nil
	case strings.Contains(sql, "DELETE FROM identity_sessions"):
		sessionID := args[0].(string)
		if _, ok := db.sessionsByID[sessionID]; !ok {
			return fakeCommandTag{rows: 0}, nil
		}
		db.deleteSession(sessionID)
		return fakeCommandTag{rows: 1}, nil
	case strings.Contains(sql, "SET revoked_at"):
		sessionID := args[0].(string)
		session, ok := db.sessionsByID[sessionID]
		if !ok {
			return fakeCommandTag{rows: 0}, nil
		}
		session.revoked = true
		db.sessionsByID[sessionID] = session
		return fakeCommandTag{rows: 1}, nil
	default:
		return fakeCommandTag{}, nil
	}
}

func (db *fakeDB) QueryRow(_ context.Context, sql string, args ...any) postgres.Row {
	db.querySQL = append(db.querySQL, sql)
	switch {
	case strings.Contains(sql, "UPDATE identity_sessions") && strings.Contains(sql, "RETURNING principal_json"):
		return db.rotateRefreshRow(args...)
	case strings.Contains(sql, "access_token ="):
		return db.rowByToken(db.sessionByAccess, args[0].(string))
	case strings.Contains(sql, "refresh_token ="):
		return db.rowByToken(db.sessionByRefresh, args[0].(string))
	default:
		return fakeRow{err: pgx.ErrNoRows}
	}
}

func (db *fakeDB) rotateRefreshRow(args ...any) postgres.Row {
	newAccess := args[0].(string)
	newRefresh := args[1].(string)
	issuedAt := args[2].(time.Time)
	expiresAt := args[3].(time.Time)
	oldRefresh := args[4].(string)
	sessionID := db.sessionByRefresh[oldRefresh]
	session := db.sessionsByID[sessionID]
	if sessionID == "" || session.revoked {
		return fakeRow{err: pgx.ErrNoRows}
	}
	if session.expiresAt.Before(issuedAt) {
		return fakeRow{err: pgx.ErrNoRows}
	}
	db.removeIndexes(sessionID)
	session.accessToken = newAccess
	session.refreshToken = newRefresh
	session.issuedAt = issuedAt
	session.expiresAt = expiresAt
	session.revoked = false
	db.sessionsByID[sessionID] = session
	db.sessionByAccess[newAccess] = sessionID
	db.sessionByRefresh[newRefresh] = sessionID
	return fakeRow{principalJSON: append([]byte(nil), session.principalJSON...), issuedAt: session.issuedAt, expiresAt: session.expiresAt}
}

func (db *fakeDB) rowByToken(index map[string]string, token string) postgres.Row {
	sessionID := index[token]
	session := db.sessionsByID[sessionID]
	if sessionID == "" || session.revoked {
		return fakeRow{err: pgx.ErrNoRows}
	}
	return fakeRow{principalJSON: append([]byte(nil), session.principalJSON...), issuedAt: session.issuedAt, expiresAt: session.expiresAt}
}

func (db *fakeDB) removeIndexes(sessionID string) {
	session := db.sessionsByID[sessionID]
	if session.accessToken != "" {
		delete(db.sessionByAccess, session.accessToken)
	}
	if session.refreshToken != "" {
		delete(db.sessionByRefresh, session.refreshToken)
	}
}

func (db *fakeDB) deleteSession(sessionID string) {
	db.removeIndexes(sessionID)
	delete(db.sessionsByID, sessionID)
}

func (db *fakeDB) markRevokedAt(sessionID string, revokedAt time.Time) {
	session := db.sessionsByID[sessionID]
	session.revoked = true
	session.revokedAt = revokedAt
	db.sessionsByID[sessionID] = session
}

func queryLogContains(queries []string, needles ...string) bool {
	for _, query := range queries {
		matched := true
		for _, needle := range needles {
			if !strings.Contains(query, needle) {
				matched = false
				break
			}
		}
		if matched {
			return true
		}
	}
	return false
}

type fakeCommandTag struct {
	rows int64
}

func (t fakeCommandTag) RowsAffected() int64 {
	return t.rows
}

type fakeRow struct {
	principalJSON []byte
	issuedAt      time.Time
	expiresAt     time.Time
	err           error
}

func (r fakeRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if len(dest) == 1 {
		target := dest[0].(*[]byte)
		*target = append([]byte(nil), r.principalJSON...)
		return nil
	}
	if len(dest) != 3 {
		return errors.New("unexpected scan arity")
	}
	*dest[0].(*[]byte) = append([]byte(nil), r.principalJSON...)
	*dest[1].(*time.Time) = r.issuedAt
	*dest[2].(*time.Time) = r.expiresAt
	return nil
}

func decodePrincipalOrFail(data []byte) domain.PrincipalContext {
	var principal domain.PrincipalContext
	if err := json.Unmarshal(data, &principal); err != nil {
		panic(err)
	}
	return principal
}

func TestPrincipalJSONFixtureIsValid(t *testing.T) {
	principal := teacherPrincipal("sess_1")
	data, err := json.Marshal(principal)
	if err != nil {
		t.Fatalf("marshal principal: %v", err)
	}
	if !json.Valid(data) {
		t.Fatalf("invalid json: %s", data)
	}
}
