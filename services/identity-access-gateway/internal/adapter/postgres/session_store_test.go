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

	if _, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_1"); err != nil || ok {
		t.Fatalf("old access ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetPrincipalByRefreshToken(context.Background(), "refresh_1"); err != nil || ok {
		t.Fatalf("old refresh ok=%v err=%v", ok, err)
	}
	if loaded, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_2"); err != nil || !ok || loaded.SessionID != "sess_1" {
		t.Fatalf("new access loaded=%#v ok=%v err=%v", loaded, ok, err)
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
	if loaded, ok, err := store.GetPrincipalByRefreshToken(context.Background(), "refresh_2"); err != nil || !ok || loaded.SessionID != "sess_1" {
		t.Fatalf("new refresh loaded=%#v ok=%v err=%v", loaded, ok, err)
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
	if !strings.Contains(db.execSQL[len(db.execSQL)-1], "session_id = $1") || !strings.Contains(db.execSQL[len(db.execSQL)-1], "access_token = $2") {
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
	revoked       bool
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
		db.removeIndexes(sessionID)
		db.sessionsByID[sessionID] = fakeSession{
			accessToken:   accessToken,
			refreshToken:  refreshToken,
			principalJSON: principalJSON,
		}
		db.sessionByAccess[accessToken] = sessionID
		if refreshToken != "" {
			db.sessionByRefresh[refreshToken] = sessionID
		}
		return fakeCommandTag{rows: 1}, nil
	case strings.Contains(sql, "WHERE refresh_token ="):
		newAccess := args[0].(string)
		newRefresh := args[1].(string)
		principalJSON := append([]byte(nil), args[2].([]byte)...)
		oldRefresh := args[5].(string)
		sessionID := db.sessionByRefresh[oldRefresh]
		session := db.sessionsByID[sessionID]
		if sessionID == "" || session.revoked {
			return fakeCommandTag{rows: 0}, nil
		}
		db.removeIndexes(sessionID)
		session.accessToken = newAccess
		session.refreshToken = newRefresh
		session.principalJSON = principalJSON
		session.revoked = false
		db.sessionsByID[sessionID] = session
		db.sessionByAccess[newAccess] = sessionID
		db.sessionByRefresh[newRefresh] = sessionID
		return fakeCommandTag{rows: 1}, nil
	case strings.Contains(sql, "access_token = $2"):
		sessionID := args[0].(string)
		accessToken := args[1].(string)
		now := args[2].(time.Time)
		session, ok := db.sessionsByID[sessionID]
		if !ok || session.revoked || session.accessToken != accessToken {
			return fakeCommandTag{rows: 0}, nil
		}
		var principal domain.PrincipalContext
		if err := json.Unmarshal(session.principalJSON, &principal); err != nil {
			return fakeCommandTag{}, err
		}
		if principal.ExpiresAt.Before(now) {
			return fakeCommandTag{rows: 0}, nil
		}
		session.revoked = true
		db.sessionsByID[sessionID] = session
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
	issuedAtText := args[2].(string)
	expiresAtText := args[3].(string)
	issuedAt := args[4].(time.Time)
	expiresAt := args[5].(time.Time)
	oldRefresh := args[6].(string)
	sessionID := db.sessionByRefresh[oldRefresh]
	session := db.sessionsByID[sessionID]
	if sessionID == "" || session.revoked {
		return fakeRow{err: pgx.ErrNoRows}
	}
	var principal domain.PrincipalContext
	if err := json.Unmarshal(session.principalJSON, &principal); err != nil {
		return fakeRow{err: err}
	}
	if principal.ExpiresAt.Before(issuedAt) {
		return fakeRow{err: pgx.ErrNoRows}
	}
	if issuedAtText == "" || expiresAtText == "" {
		return fakeRow{err: errors.New("missing json time text")}
	}
	principal.IssuedAt = issuedAt
	principal.ExpiresAt = expiresAt
	principalJSON, err := json.Marshal(principal)
	if err != nil {
		return fakeRow{err: err}
	}
	db.removeIndexes(sessionID)
	session.accessToken = newAccess
	session.refreshToken = newRefresh
	session.principalJSON = principalJSON
	session.revoked = false
	db.sessionsByID[sessionID] = session
	db.sessionByAccess[newAccess] = sessionID
	db.sessionByRefresh[newRefresh] = sessionID
	return fakeRow{json: principalJSON}
}

func (db *fakeDB) rowByToken(index map[string]string, token string) postgres.Row {
	sessionID := index[token]
	session := db.sessionsByID[sessionID]
	if sessionID == "" || session.revoked {
		return fakeRow{err: pgx.ErrNoRows}
	}
	return fakeRow{json: session.principalJSON}
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
	json []byte
	err  error
}

func (r fakeRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	target := dest[0].(*[]byte)
	*target = append([]byte(nil), r.json...)
	return nil
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
