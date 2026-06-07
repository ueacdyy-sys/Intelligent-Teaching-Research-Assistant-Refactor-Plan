package postgres_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

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

func TestSessionStoreRoutesPrincipalReadsToConfiguredReadDB(t *testing.T) {
	writeDB := newFakeDB()
	readDB := &queryRoutingDB{delegate: writeDB}
	store := postgres.NewSessionStoreWithConfig(writeDB, postgres.SessionStoreConfig{ReadDB: readDB})
	principal := teacherPrincipal("sess_read_pool")

	if err := store.SaveSession(context.Background(), "access_read_pool", "refresh_read_pool", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}

	loaded, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_read_pool")
	if err != nil {
		t.Fatalf("GetPrincipalByAccessToken error = %v", err)
	}
	if !ok || loaded.SessionID != "sess_read_pool" {
		t.Fatalf("loaded=%#v ok=%v", loaded, ok)
	}
	if len(writeDB.querySQL) != 0 {
		t.Fatalf("principal read used write DB queries: %#v", writeDB.querySQL)
	}
	if !queryLogContains(readDB.querySQL, "FROM identity_sessions", "access_token = $1") {
		t.Fatalf("principal read did not use configured read DB: %#v", readDB.querySQL)
	}
}

func TestSessionStoreAccessCacheServesPrincipalReadsWithoutReadDB(t *testing.T) {
	writeDB := newFakeDB()
	readDB := &queryRoutingDB{delegate: writeDB}
	store := postgres.NewSessionStoreWithConfig(writeDB, postgres.SessionStoreConfig{
		ReadDB: readDB,
		AccessCache: postgres.SessionAccessCacheConfig{
			MaxEntries: 16,
			TTL:        time.Minute,
		},
	})
	principal := teacherPrincipal("sess_cached")
	principal.IssuedAt = time.Now().UTC()
	principal.ExpiresAt = principal.IssuedAt.Add(time.Hour)

	if err := store.SaveSession(context.Background(), "access_cached", "refresh_cached", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}
	loaded, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_cached")
	if err != nil {
		t.Fatalf("GetPrincipalByAccessToken error = %v", err)
	}
	if !ok || loaded.SessionID != "sess_cached" {
		t.Fatalf("loaded=%#v ok=%v", loaded, ok)
	}
	if len(readDB.querySQL) != 0 {
		t.Fatalf("cached principal read used read DB: %#v", readDB.querySQL)
	}
}

func TestSessionStoreAccessCacheInvalidatesOldAccessOnRefreshRotation(t *testing.T) {
	db := newFakeDB()
	store := postgres.NewSessionStoreWithConfig(db, postgres.SessionStoreConfig{
		AccessCache: postgres.SessionAccessCacheConfig{
			MaxEntries: 16,
			TTL:        time.Minute,
		},
	})
	principal := teacherPrincipal("sess_cached_rotate")
	principal.IssuedAt = time.Now().UTC()
	principal.ExpiresAt = principal.IssuedAt.Add(time.Hour)
	if err := store.SaveSession(context.Background(), "access_old", "refresh_old", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}
	if _, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_old"); err != nil || !ok {
		t.Fatalf("cached old access ok=%v err=%v", ok, err)
	}

	refreshed, ok, err := store.RotateRefreshSession(
		context.Background(),
		"refresh_old",
		"access_new",
		"refresh_new",
		principal.IssuedAt.Add(time.Minute),
		principal.ExpiresAt.Add(time.Minute),
	)
	if err != nil || !ok || refreshed.SessionID != "sess_cached_rotate" {
		t.Fatalf("RotateRefreshSession refreshed=%#v ok=%v err=%v", refreshed, ok, err)
	}
	if _, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_old"); err != nil || ok {
		t.Fatalf("old access remained cached ok=%v err=%v", ok, err)
	}
	if loaded, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_new"); err != nil || !ok || loaded.SessionID != "sess_cached_rotate" {
		t.Fatalf("new access loaded=%#v ok=%v err=%v", loaded, ok, err)
	}
}

func TestSessionStoreSaveSessionUsesInsertOnlySessionIDs(t *testing.T) {
	db := newFakeDB()
	store := postgres.NewSessionStore(db)
	principal := teacherPrincipal("sess_1")

	if err := store.SaveSession(context.Background(), "access_1", "refresh_1", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}

	insertSQL := db.execSQL[0]
	if strings.Contains(insertSQL, "ON CONFLICT") {
		t.Fatalf("SaveSession must not upsert generated session IDs: %s", insertSQL)
	}
}

func TestSessionStoreSaveSessionRejectsDuplicateSessionID(t *testing.T) {
	db := newFakeDB()
	store := postgres.NewSessionStore(db)
	principal := teacherPrincipal("sess_1")
	if err := store.SaveSession(context.Background(), "access_1", "refresh_1", principal); err != nil {
		t.Fatalf("SaveSession first error = %v", err)
	}

	err := store.SaveSession(context.Background(), "access_2", "refresh_2", principal)

	if err == nil {
		t.Fatal("SaveSession accepted a duplicate generated session ID")
	}
	if loaded, ok, loadErr := store.GetPrincipalByAccessToken(context.Background(), "access_1"); loadErr != nil || !ok || loaded.SessionID != "sess_1" {
		t.Fatalf("original session loaded=%#v ok=%v err=%v", loaded, ok, loadErr)
	}
	if _, ok, loadErr := store.GetPrincipalByAccessToken(context.Background(), "access_2"); loadErr != nil || ok {
		t.Fatalf("duplicate write replaced token mapping ok=%v err=%v", ok, loadErr)
	}
}

func TestSessionStoreWriteConcurrencyLimitsOverlappingWrites(t *testing.T) {
	db := newBlockingWriteDB()
	store := postgres.NewSessionStoreWithConfig(db, postgres.SessionStoreConfig{WriteConcurrency: 1})
	first := make(chan error, 1)
	second := make(chan error, 1)

	go func() {
		first <- store.SaveSession(context.Background(), "access_1", "refresh_1", teacherPrincipal("sess_1"))
	}()
	db.waitForExec(t, 1)

	go func() {
		second <- store.SaveSession(context.Background(), "access_2", "refresh_2", teacherPrincipal("sess_2"))
	}()
	db.assertNoExec(t)

	db.releaseOne()
	if err := <-first; err != nil {
		t.Fatalf("first SaveSession error = %v", err)
	}
	db.waitForExec(t, 2)
	db.releaseOne()
	if err := <-second; err != nil {
		t.Fatalf("second SaveSession error = %v", err)
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

func TestEnsureSchemaUsesLowWriteAmplificationExpiresIndex(t *testing.T) {
	db := newFakeDB()

	if err := postgres.EnsureSchema(context.Background(), db); err != nil {
		t.Fatalf("EnsureSchema error = %v", err)
	}

	schemaSQL := strings.Join(db.execSQL, "\n")
	if !strings.Contains(schemaSQL, "DROP INDEX IF EXISTS idx_identity_sessions_expires_at") {
		t.Fatalf("schema should drop the old btree expires_at index:\n%s", schemaSQL)
	}
	if !strings.Contains(schemaSQL, "CREATE INDEX IF NOT EXISTS idx_identity_sessions_expires_at_brin") ||
		!strings.Contains(schemaSQL, "USING BRIN") ||
		!strings.Contains(schemaSQL, "ON identity_sessions USING BRIN (expires_at)") {
		t.Fatalf("schema should create a BRIN expires_at index:\n%s", schemaSQL)
	}
	if strings.Contains(schemaSQL, "CREATE INDEX IF NOT EXISTS idx_identity_sessions_expires_at\n\t\tON identity_sessions (expires_at)") {
		t.Fatalf("schema still creates the old btree expires_at index:\n%s", schemaSQL)
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
