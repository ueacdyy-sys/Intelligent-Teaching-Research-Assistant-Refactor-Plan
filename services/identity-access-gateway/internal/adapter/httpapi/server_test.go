package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ita-refactor/services/identity-access-gateway/internal/adapter/httpapi"
	"ita-refactor/services/identity-access-gateway/internal/domain"
	"ita-refactor/services/identity-access-gateway/internal/platform"
	"ita-refactor/services/identity-access-gateway/internal/usecase"
)

func TestSessionDBPoolDiagnosticsDisabledWithoutProvider(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(http.MethodGet, "/internal/identity/session-db-pool", nil)
	request.Header.Set("X-Internal-Diagnostics-Secret", "ueacd")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestSessionDBPoolDiagnosticsRequiresSecret(t *testing.T) {
	handler := newDiagnosticsTestHandler(fakePoolStatsProvider{})
	request := httptest.NewRequest(http.MethodGet, "/internal/identity/session-db-pool", nil)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}

	wrongSecret := httptest.NewRequest(http.MethodGet, "/internal/identity/session-db-pool", nil)
	wrongSecret.Header.Set("X-Internal-Diagnostics-Secret", "wrong")
	wrongSecretResponse := httptest.NewRecorder()
	handler.ServeHTTP(wrongSecretResponse, wrongSecret)

	if wrongSecretResponse.Code != http.StatusUnauthorized {
		t.Fatalf("wrong secret status = %d, body = %s", wrongSecretResponse.Code, wrongSecretResponse.Body.String())
	}
}

func TestSessionDBPoolDiagnosticsReturnsPoolStats(t *testing.T) {
	handler := newDiagnosticsTestHandler(fakePoolStatsProvider{})
	request := httptest.NewRequest(http.MethodGet, "/internal/identity/session-db-pool", nil)
	request.Header.Set("X-Internal-Diagnostics-Secret", "ueacd")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}

	var body struct {
		Status string                      `json:"status"`
		Stats  platform.SessionDBPoolStats `json:"stats"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON: %v", err)
	}
	if body.Status != "ok" {
		t.Fatalf("status = %q", body.Status)
	}
	if body.Stats.MaxConns != 12 {
		t.Fatalf("maxConns = %d", body.Stats.MaxConns)
	}
	if body.Stats.AcquireDurationMs != 123.5 {
		t.Fatalf("acquireDurationMs = %v", body.Stats.AcquireDurationMs)
	}
	if !body.Stats.WriteLimiter.Enabled {
		t.Fatal("write limiter stats should report enabled")
	}
	if body.Stats.WriteLimiter.Waiting != 2 {
		t.Fatalf("write limiter waiting = %d want 2", body.Stats.WriteLimiter.Waiting)
	}
	if bytes.Contains(response.Body.Bytes(), []byte("ueacd")) {
		t.Fatalf("diagnostics leaked secret: %s", response.Body.String())
	}
}

func TestPasswordSessionReturnsPrincipalContext(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/identity/sessions/password",
		bytes.NewBufferString(`{"identifier":"teacher@example.com","password":"ueacd","entryPoint":"DESKTOP_TEACHER","requestedRole":"TEACHER"}`),
	)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}

	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON: %v", err)
	}
	principal := body["principal"].(map[string]any)
	if principal["role"] != "TEACHER" {
		t.Fatalf("role = %v", principal["role"])
	}
	if principal["requiresHarnessApproval"] != false {
		t.Fatalf("requiresHarnessApproval = %v", principal["requiresHarnessApproval"])
	}
}

func TestGetPrincipalRequiresBearerToken(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(http.MethodGet, "/v1/identity/principal", nil)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestGetPrincipalReturnsExistingPrincipal(t *testing.T) {
	handler := newTestHandler()
	login := httptest.NewRequest(
		http.MethodPost,
		"/v1/identity/sessions/password",
		bytes.NewBufferString(`{"identifier":"student001","password":"ueacd","entryPoint":"STUDENT_APP","requestedRole":"STUDENT"}`),
	)
	loginResponse := httptest.NewRecorder()
	handler.ServeHTTP(loginResponse, login)
	if loginResponse.Code != http.StatusCreated {
		t.Fatalf("login status = %d, body = %s", loginResponse.Code, loginResponse.Body.String())
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/identity/principal", nil)
	request.Header.Set("Authorization", "Bearer access_http_1")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"entryPoint":"STUDENT_APP"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestRefreshSessionReturnsRotatedPrincipalSession(t *testing.T) {
	handler := newTestHandler()
	login := httptest.NewRequest(
		http.MethodPost,
		"/v1/identity/sessions/password",
		bytes.NewBufferString(`{"identifier":"teacher@example.com","password":"ueacd","entryPoint":"DESKTOP_RESEARCH","requestedRole":"TEACHER"}`),
	)
	loginResponse := httptest.NewRecorder()
	handler.ServeHTTP(loginResponse, login)
	if loginResponse.Code != http.StatusCreated {
		t.Fatalf("login status = %d, body = %s", loginResponse.Code, loginResponse.Body.String())
	}

	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/identity/sessions/refresh",
		bytes.NewBufferString(`{"refreshToken":"refresh_http_1"}`),
	)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"refreshToken":"refresh_http_2"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"entryPoint":"DESKTOP_RESEARCH"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestRevokeSessionInvalidatesPrincipalLookup(t *testing.T) {
	handler := newTestHandler()
	login := httptest.NewRequest(
		http.MethodPost,
		"/v1/identity/sessions/password",
		bytes.NewBufferString(`{"identifier":"student001","password":"ueacd","entryPoint":"STUDENT_APP","requestedRole":"STUDENT"}`),
	)
	loginResponse := httptest.NewRecorder()
	handler.ServeHTTP(loginResponse, login)
	if loginResponse.Code != http.StatusCreated {
		t.Fatalf("login status = %d, body = %s", loginResponse.Code, loginResponse.Body.String())
	}

	revoke := httptest.NewRequest(http.MethodDelete, "/v1/identity/sessions/sess_http_1", nil)
	revoke.Header.Set("Authorization", "Bearer access_http_1")
	revokeResponse := httptest.NewRecorder()
	handler.ServeHTTP(revokeResponse, revoke)
	if revokeResponse.Code != http.StatusNoContent {
		t.Fatalf("revoke status = %d, body = %s", revokeResponse.Code, revokeResponse.Body.String())
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/identity/principal", nil)
	request.Header.Set("Authorization", "Bearer access_http_1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestRemoteCommandGrantRequiresChannelSignature(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/identity/remote-command-grants",
		bytes.NewBufferString(`{"provider":"WECHAT","externalSubjectId":"openid","commandPreview":"帮我发起测试","nonce":"nonce-123","issuedAt":"2026-05-28T08:00:00Z"}`),
	)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestRemoteCommandGrantReturnsApprovalBoundPrincipal(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/identity/remote-command-grants",
		bytes.NewBufferString(`{"provider":"WECHAT","externalSubjectId":"openid","commandPreview":"帮我发起测试","nonce":"nonce-123","issuedAt":"2026-05-28T08:00:00Z"}`),
	)
	request.Header.Set("X-Channel-Signature", "ueacd")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"requiresHarnessApproval":true`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if bytes.Contains(response.Body.Bytes(), []byte(`DEVICE_LOCAL_CONTROL`)) {
		t.Fatalf("remote grant leaked local control scope: %s", response.Body.String())
	}
}

func TestRemoteCommandGrantRejectsReplayNonce(t *testing.T) {
	handler := newTestHandler()
	body := `{"provider":"WECHAT","externalSubjectId":"openid","commandPreview":"帮我发起测试","nonce":"nonce-123","issuedAt":"2026-05-28T08:00:00Z"}`
	first := httptest.NewRequest(http.MethodPost, "/v1/identity/remote-command-grants", bytes.NewBufferString(body))
	first.Header.Set("X-Channel-Signature", "ueacd")
	firstResponse := httptest.NewRecorder()
	handler.ServeHTTP(firstResponse, first)
	if firstResponse.Code != http.StatusCreated {
		t.Fatalf("first status = %d, body = %s", firstResponse.Code, firstResponse.Body.String())
	}

	replay := httptest.NewRequest(http.MethodPost, "/v1/identity/remote-command-grants", bytes.NewBufferString(body))
	replay.Header.Set("X-Channel-Signature", "ueacd")
	replayResponse := httptest.NewRecorder()
	handler.ServeHTTP(replayResponse, replay)

	if replayResponse.Code != http.StatusUnauthorized {
		t.Fatalf("replay status = %d, body = %s", replayResponse.Code, replayResponse.Body.String())
	}
}

func TestRemoteCommandGrantRejectsStaleIssuedAt(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/identity/remote-command-grants",
		bytes.NewBufferString(`{"provider":"WECHAT","externalSubjectId":"openid","commandPreview":"帮我发起测试","nonce":"nonce-123","issuedAt":"2026-05-28T07:57:00Z"}`),
	)
	request.Header.Set("X-Channel-Signature", "ueacd")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestRemoteCommandGrantRejectsFutureIssuedAtBeyondSkew(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/identity/remote-command-grants",
		bytes.NewBufferString(`{"provider":"WECHAT","externalSubjectId":"openid","commandPreview":"帮我发起测试","nonce":"nonce-123","issuedAt":"2026-05-28T08:01:00Z"}`),
	)
	request.Header.Set("X-Channel-Signature", "ueacd")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestStartWeChatSessionReturnsChallenge(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/identity/sessions/wechat",
		bytes.NewBufferString(`{"requestedRole":"TEACHER","entryPoint":"DESKTOP_TEACHER","redirectUri":"ita://auth/wechat"}`),
	)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"state":"grant_http_1"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"authUrl"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestCompleteWeChatSessionReturnsPrincipalContext(t *testing.T) {
	handler := newTestHandler()
	start := httptest.NewRequest(
		http.MethodPost,
		"/v1/identity/sessions/wechat",
		bytes.NewBufferString(`{"requestedRole":"TEACHER","entryPoint":"DESKTOP_RESEARCH"}`),
	)
	startResponse := httptest.NewRecorder()
	handler.ServeHTTP(startResponse, start)
	if startResponse.Code != http.StatusAccepted {
		t.Fatalf("start status = %d, body = %s", startResponse.Code, startResponse.Body.String())
	}

	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/identity/sessions/wechat/callback",
		bytes.NewBufferString(`{"state":"grant_http_1","code":"ueacd"}`),
	)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"entryPoint":"DESKTOP_RESEARCH"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func newTestHandler() http.Handler {
	return httpapi.NewServer(newTestIdentityService(), "ueacd").Handler()
}

func newDiagnosticsTestHandler(provider platform.SessionDBPoolStatsProvider) http.Handler {
	return httpapi.NewServerWithConfig(httpapi.ServerConfig{
		Identity:                   newTestIdentityService(),
		ChannelSignature:           "ueacd",
		DiagnosticsSecret:          "ueacd",
		SessionDBPoolStatsProvider: provider,
	}).Handler()
}

func newTestIdentityService() *usecase.IdentityService {
	wechat := newFakeWeChatAuthenticator()
	return usecase.NewIdentityServiceWithWeChat(
		fakeAuthenticator{},
		wechat,
		usecase.NewMemorySessionStore(),
		&sequenceIssuer{},
		fixedClock{now: time.Date(2026, 5, 28, 8, 0, 0, 0, time.UTC)},
	)
}

type fakePoolStatsProvider struct{}

func (fakePoolStatsProvider) SessionDBPoolStats() platform.SessionDBPoolStats {
	return platform.SessionDBPoolStats{
		MaxConns:                12,
		TotalConns:              10,
		AcquiredConns:           8,
		IdleConns:               2,
		ConstructingConns:       1,
		AcquireCount:            200,
		AcquireDurationMs:       123.5,
		CanceledAcquireCount:    3,
		EmptyAcquireCount:       4,
		EmptyAcquireWaitTimeMs:  45.25,
		NewConnsCount:           7,
		MaxIdleDestroyCount:     1,
		MaxLifetimeDestroyCount: 2,
		WriteLimiter: platform.SessionWriteLimiterStats{
			Enabled:           true,
			Limit:             10,
			InUse:             3,
			Waiting:           2,
			AcquireCount:      19,
			AcquireWaitTimeMs: 88.75,
		},
	}
}

type fakeAuthenticator struct{}

func (fakeAuthenticator) AuthenticatePassword(_ context.Context, input domain.PasswordSessionInput) (domain.Account, error) {
	if input.Password != "ueacd" {
		return domain.Account{}, domain.ErrInvalidCredentials
	}
	switch input.Identifier {
	case "teacher@example.com":
		return domain.Account{ID: "user_teacher", Role: domain.RoleTeacher, DisplayName: "Teacher"}, nil
	case "student001":
		return domain.Account{ID: "user_student", Role: domain.RoleStudent, DisplayName: "Student"}, nil
	default:
		return domain.Account{}, domain.ErrInvalidCredentials
	}
}

type fakeWeChatAuthenticator struct {
	pending map[string]domain.WeChatSessionStartInput
}

func newFakeWeChatAuthenticator() *fakeWeChatAuthenticator {
	return &fakeWeChatAuthenticator{pending: map[string]domain.WeChatSessionStartInput{}}
}

func (f *fakeWeChatAuthenticator) StartWeChatLogin(
	_ context.Context,
	input domain.WeChatSessionStartInput,
	state string,
	expiresAt time.Time,
) (domain.WeChatLoginChallenge, error) {
	f.pending[state] = input
	return domain.WeChatLoginChallenge{
		State:     state,
		AuthURL:   "https://wechat.example/qr?state=" + state,
		ExpiresAt: expiresAt,
	}, nil
}

func (f *fakeWeChatAuthenticator) CompleteWeChatLogin(
	_ context.Context,
	input domain.WeChatSessionCallbackInput,
) (domain.Account, domain.Role, domain.EntryPoint, error) {
	start, ok := f.pending[input.State]
	if !ok || input.Code != "ueacd" {
		return domain.Account{}, "", "", domain.ErrInvalidCredentials
	}
	return domain.Account{ID: "wechat_teacher", Role: start.RequestedRole, DisplayName: "WeChat Teacher"}, start.RequestedRole, start.EntryPoint, nil
}

type fixedIssuer struct{}

func (fixedIssuer) NewSessionID() string    { return "sess_http" }
func (fixedIssuer) NewAccessToken() string  { return "access_http" }
func (fixedIssuer) NewRefreshToken() string { return "refresh_http" }
func (fixedIssuer) NewGrantToken() string   { return "grant_http" }

type sequenceIssuer struct {
	session int
	access  int
	refresh int
	grant   int
}

func (s *sequenceIssuer) NewSessionID() string {
	s.session += 1
	return "sess_http_" + string(rune('0'+s.session))
}

func (s *sequenceIssuer) NewAccessToken() string {
	s.access += 1
	return "access_http_" + string(rune('0'+s.access))
}

func (s *sequenceIssuer) NewRefreshToken() string {
	s.refresh += 1
	return "refresh_http_" + string(rune('0'+s.refresh))
}

func (s *sequenceIssuer) NewGrantToken() string {
	s.grant += 1
	return "grant_http_" + string(rune('0'+s.grant))
}

type fixedClock struct {
	now time.Time
}

func (f fixedClock) Now() time.Time {
	return f.now
}
