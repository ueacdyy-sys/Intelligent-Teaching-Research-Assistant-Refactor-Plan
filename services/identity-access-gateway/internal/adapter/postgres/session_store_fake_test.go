package postgres_test

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"ita-refactor/services/identity-access-gateway/internal/adapter/postgres"
	"ita-refactor/services/identity-access-gateway/internal/domain"
)

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

type queryRoutingDB struct {
	delegate *fakeDB
	querySQL []string
}

func (db *queryRoutingDB) Exec(ctx context.Context, sql string, args ...any) (postgres.CommandTag, error) {
	return db.delegate.Exec(ctx, sql, args...)
}

func (db *queryRoutingDB) QueryRow(ctx context.Context, sql string, args ...any) postgres.Row {
	db.querySQL = append(db.querySQL, sql)
	switch {
	case strings.Contains(sql, "access_token ="):
		return db.delegate.rowByToken(db.delegate.sessionByAccess, args[0].(string))
	case strings.Contains(sql, "refresh_token ="):
		return db.delegate.rowByToken(db.delegate.sessionByRefresh, args[0].(string))
	default:
		return fakeRow{err: pgx.ErrNoRows}
	}
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
		issuedAt := args[4].(time.Time)
		expiresAt := args[5].(time.Time)
		if _, ok := db.sessionsByID[sessionID]; ok {
			return fakeCommandTag{}, errors.New("duplicate session id")
		}
		db.removeIndexes(sessionID)
		db.sessionsByID[sessionID] = fakeSession{
			accessToken:   accessToken,
			refreshToken:  refreshToken,
			principalJSON: principalJSON,
			issuedAt:      issuedAt,
			expiresAt:     expiresAt,
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

type blockingWriteDB struct {
	mu      sync.Mutex
	calls   int
	entered chan int
	release chan struct{}
}

func newBlockingWriteDB() *blockingWriteDB {
	return &blockingWriteDB{
		entered: make(chan int, 2),
		release: make(chan struct{}),
	}
}

func (db *blockingWriteDB) Exec(_ context.Context, _ string, _ ...any) (postgres.CommandTag, error) {
	db.mu.Lock()
	db.calls++
	call := db.calls
	db.mu.Unlock()
	db.entered <- call
	<-db.release
	return fakeCommandTag{rows: 1}, nil
}

func (db *blockingWriteDB) QueryRow(context.Context, string, ...any) postgres.Row {
	return fakeRow{err: pgx.ErrNoRows}
}

func (db *blockingWriteDB) waitForExec(t *testing.T, want int) {
	t.Helper()
	select {
	case got := <-db.entered:
		if got != want {
			t.Fatalf("write call = %d want %d", got, want)
		}
	case <-time.After(time.Second):
		t.Fatalf("timed out waiting for write call %d", want)
	}
}

func (db *blockingWriteDB) assertNoExec(t *testing.T) {
	t.Helper()
	select {
	case got := <-db.entered:
		t.Fatalf("write limiter allowed overlapping write call %d", got)
	case <-time.After(25 * time.Millisecond):
	}
}

func (db *blockingWriteDB) releaseOne() {
	db.release <- struct{}{}
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
