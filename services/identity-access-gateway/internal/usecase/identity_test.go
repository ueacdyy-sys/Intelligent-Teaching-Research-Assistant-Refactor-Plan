package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/identity-access-gateway/internal/domain"
	"ita-refactor/services/identity-access-gateway/internal/usecase"
)

func TestCreatePasswordSessionProjectsTeacherDesktopPrincipal(t *testing.T) {
	service := newTestService()

	session, err := service.CreatePasswordSession(context.Background(), domain.PasswordSessionInput{
		Identifier:    "teacher@example.com",
		Password:      "ueacd",
		RequestedRole: domain.RoleTeacher,
		EntryPoint:    domain.EntryPointDesktopTeacher,
	})
	if err != nil {
		t.Fatalf("CreatePasswordSession error = %v", err)
	}

	if session.Principal.Role != domain.RoleTeacher {
		t.Fatalf("role = %s", session.Principal.Role)
	}
	assertHasScope(t, session.Principal, domain.ScopeTeachingWrite)
	assertHasScope(t, session.Principal, domain.ScopeKnowledgePrivateRead)
	if session.Principal.KnowledgeAccess.Private != domain.PrivateAccessAssigned {
		t.Fatalf("private knowledge access = %s", session.Principal.KnowledgeAccess.Private)
	}
	if session.Principal.RequiresHarnessApproval {
		t.Fatal("teacher desktop principal should not require harness approval for normal session")
	}
}

func TestCreatePasswordSessionProjectsStudentAppPrincipalWithoutPrivateKnowledge(t *testing.T) {
	service := newTestService()

	session, err := service.CreatePasswordSession(context.Background(), domain.PasswordSessionInput{
		Identifier:    "student001",
		Password:      "ueacd",
		RequestedRole: domain.RoleStudent,
		EntryPoint:    domain.EntryPointStudentApp,
	})
	if err != nil {
		t.Fatalf("CreatePasswordSession error = %v", err)
	}

	if session.Principal.Role != domain.RoleStudent {
		t.Fatalf("role = %s", session.Principal.Role)
	}
	assertHasScope(t, session.Principal, domain.ScopeStudentOwnRead)
	assertNoScope(t, session.Principal, domain.ScopeKnowledgePrivateRead)
	if session.Principal.StudentAccess.Mode != domain.StudentAccessOwn {
		t.Fatalf("student access = %s", session.Principal.StudentAccess.Mode)
	}
	if session.Principal.KnowledgeAccess.Private != domain.PrivateAccessNone {
		t.Fatalf("private knowledge access = %s", session.Principal.KnowledgeAccess.Private)
	}
}

func TestCreateRemoteCommandGrantRequiresHarnessApproval(t *testing.T) {
	service := newTestService()

	grant, err := service.CreateRemoteCommandGrant(context.Background(), domain.RemoteCommandGrantInput{
		Provider:          domain.ChannelProviderWeChat,
		ExternalSubjectID: "wechat-openid-1",
		CommandPreview:    "帮我创建一条随堂测验",
		Nonce:             "nonce-123",
		IssuedAt:          time.Date(2026, 5, 28, 8, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("CreateRemoteCommandGrant error = %v", err)
	}

	if grant.Principal.Role != domain.RoleRemoteOperator {
		t.Fatalf("role = %s", grant.Principal.Role)
	}
	assertHasScope(t, grant.Principal, domain.ScopeAgentCommandSubmit)
	assertNoScope(t, grant.Principal, domain.ScopeDeviceLocalControl)
	if !grant.Principal.RequiresHarnessApproval {
		t.Fatal("remote command grant must require Harness approval")
	}
	if grant.Principal.Channel == nil || grant.Principal.Channel.Provider != domain.ChannelProviderWeChat {
		t.Fatalf("channel = %#v", grant.Principal.Channel)
	}
}

func TestCreateRemoteCommandGrantRejectsReplayNonce(t *testing.T) {
	service := newTestService()
	input := domain.RemoteCommandGrantInput{
		Provider:          domain.ChannelProviderWeChat,
		ExternalSubjectID: "wechat-openid-1",
		CommandPreview:    "帮我创建一条随堂测验",
		Nonce:             "nonce-123",
		IssuedAt:          time.Date(2026, 5, 28, 8, 0, 0, 0, time.UTC),
	}

	if _, err := service.CreateRemoteCommandGrant(context.Background(), input); err != nil {
		t.Fatalf("first CreateRemoteCommandGrant error = %v", err)
	}
	_, err := service.CreateRemoteCommandGrant(context.Background(), input)

	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatalf("replayed nonce err = %v", err)
	}
}

func TestCreateRemoteCommandGrantRejectsStaleIssuedAt(t *testing.T) {
	service := newTestService()

	_, err := service.CreateRemoteCommandGrant(context.Background(), domain.RemoteCommandGrantInput{
		Provider:          domain.ChannelProviderWeChat,
		ExternalSubjectID: "wechat-openid-1",
		CommandPreview:    "帮我创建一条随堂测验",
		Nonce:             "nonce-123",
		IssuedAt:          time.Date(2026, 5, 28, 7, 57, 0, 0, time.UTC),
	})

	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("stale issuedAt err = %v", err)
	}
}

func TestCreateRemoteCommandGrantRejectsFutureIssuedAtBeyondSkew(t *testing.T) {
	service := newTestService()

	_, err := service.CreateRemoteCommandGrant(context.Background(), domain.RemoteCommandGrantInput{
		Provider:          domain.ChannelProviderWeChat,
		ExternalSubjectID: "wechat-openid-1",
		CommandPreview:    "帮我创建一条随堂测验",
		Nonce:             "nonce-123",
		IssuedAt:          time.Date(2026, 5, 28, 8, 1, 0, 0, time.UTC),
	})

	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("future issuedAt err = %v", err)
	}
}

func TestStartWeChatSessionReturnsChallenge(t *testing.T) {
	wechat := newFakeWeChatAuthenticator()
	service := newTestServiceWithWeChat(wechat, fixedIssuer{})

	challenge, err := service.StartWeChatSession(context.Background(), domain.WeChatSessionStartInput{
		RequestedRole: domain.RoleTeacher,
		EntryPoint:    domain.EntryPointDesktopTeacher,
		RedirectURI:   " ita://auth/wechat ",
	})
	if err != nil {
		t.Fatalf("StartWeChatSession error = %v", err)
	}

	if challenge.State != "grant_test" || challenge.AuthURL == "" {
		t.Fatalf("challenge = %#v", challenge)
	}
	if wechat.pending["grant_test"].RedirectURI != "ita://auth/wechat" {
		t.Fatalf("redirect URI was not normalized: %#v", wechat.pending["grant_test"])
	}
}

func TestCompleteWeChatSessionProjectsTeacherPrincipal(t *testing.T) {
	wechat := newFakeWeChatAuthenticator()
	service := newTestServiceWithWeChat(wechat, &sequenceIssuer{})
	if _, err := service.StartWeChatSession(context.Background(), domain.WeChatSessionStartInput{
		RequestedRole: domain.RoleTeacher,
		EntryPoint:    domain.EntryPointDesktopResearch,
	}); err != nil {
		t.Fatalf("StartWeChatSession error = %v", err)
	}

	session, err := service.CompleteWeChatSession(context.Background(), domain.WeChatSessionCallbackInput{
		State: "grant_seq_1",
		Code:  "ueacd",
	})
	if err != nil {
		t.Fatalf("CompleteWeChatSession error = %v", err)
	}

	if session.Principal.Role != domain.RoleTeacher || session.Principal.EntryPoint != domain.EntryPointDesktopResearch {
		t.Fatalf("principal = %#v", session.Principal)
	}
	assertHasScope(t, session.Principal, domain.ScopeResearchRead)
	assertNoScope(t, session.Principal, domain.ScopeAdminSystem)
}

func TestStartWeChatSessionRejectsStudentRole(t *testing.T) {
	service := newTestServiceWithWeChat(newFakeWeChatAuthenticator(), fixedIssuer{})

	_, err := service.StartWeChatSession(context.Background(), domain.WeChatSessionStartInput{
		RequestedRole: domain.RoleStudent,
		EntryPoint:    domain.EntryPointStudentApp,
	})

	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("err = %v", err)
	}
}

func TestGetPrincipalResolvesSessionFromAccessToken(t *testing.T) {
	service := newTestService()
	session, err := service.CreatePasswordSession(context.Background(), domain.PasswordSessionInput{
		Identifier: "teacher@example.com",
		Password:   "ueacd",
		EntryPoint: domain.EntryPointDesktopResearch,
	})
	if err != nil {
		t.Fatalf("CreatePasswordSession error = %v", err)
	}

	principal, err := service.GetPrincipal(context.Background(), session.AccessToken)
	if err != nil {
		t.Fatalf("GetPrincipal error = %v", err)
	}
	if principal.SessionID != session.Principal.SessionID {
		t.Fatalf("session id = %s, want %s", principal.SessionID, session.Principal.SessionID)
	}
	if principal.EntryPoint != domain.EntryPointDesktopResearch {
		t.Fatalf("entryPoint = %s", principal.EntryPoint)
	}
}

func TestRefreshSessionRotatesTokensAndInvalidatesOldAccess(t *testing.T) {
	service := newTestServiceWithIssuer(&sequenceIssuer{})
	session, err := service.CreatePasswordSession(context.Background(), domain.PasswordSessionInput{
		Identifier: "teacher@example.com",
		Password:   "ueacd",
		EntryPoint: domain.EntryPointDesktopResearch,
	})
	if err != nil {
		t.Fatalf("CreatePasswordSession error = %v", err)
	}

	refreshed, err := service.RefreshSession(context.Background(), session.RefreshToken)
	if err != nil {
		t.Fatalf("RefreshSession error = %v", err)
	}
	if refreshed.AccessToken == session.AccessToken {
		t.Fatal("refresh did not rotate access token")
	}
	if refreshed.RefreshToken == session.RefreshToken {
		t.Fatal("refresh did not rotate refresh token")
	}
	if refreshed.Principal.SessionID != session.Principal.SessionID {
		t.Fatalf("session id = %s, want %s", refreshed.Principal.SessionID, session.Principal.SessionID)
	}
	if _, err := service.GetPrincipal(context.Background(), session.AccessToken); !errors.Is(err, domain.ErrInvalidSession) {
		t.Fatalf("old access token err = %v", err)
	}
	if _, err := service.RefreshSession(context.Background(), session.RefreshToken); !errors.Is(err, domain.ErrInvalidSession) {
		t.Fatalf("old refresh token err = %v", err)
	}
}

func TestRevokeSessionInvalidatesAccessAndRefreshTokens(t *testing.T) {
	service := newTestServiceWithIssuer(&sequenceIssuer{})
	session, err := service.CreatePasswordSession(context.Background(), domain.PasswordSessionInput{
		Identifier: "student001",
		Password:   "ueacd",
		EntryPoint: domain.EntryPointStudentApp,
	})
	if err != nil {
		t.Fatalf("CreatePasswordSession error = %v", err)
	}

	if err := service.RevokeSession(context.Background(), session.AccessToken, session.Principal.SessionID); err != nil {
		t.Fatalf("RevokeSession error = %v", err)
	}
	if _, err := service.GetPrincipal(context.Background(), session.AccessToken); !errors.Is(err, domain.ErrInvalidSession) {
		t.Fatalf("revoked access err = %v", err)
	}
	if _, err := service.RefreshSession(context.Background(), session.RefreshToken); !errors.Is(err, domain.ErrInvalidSession) {
		t.Fatalf("revoked refresh err = %v", err)
	}
}

func TestRevokeSessionRejectsDifferentSession(t *testing.T) {
	service := newTestServiceWithIssuer(&sequenceIssuer{})
	session, err := service.CreatePasswordSession(context.Background(), domain.PasswordSessionInput{
		Identifier: "student001",
		Password:   "ueacd",
		EntryPoint: domain.EntryPointStudentApp,
	})
	if err != nil {
		t.Fatalf("CreatePasswordSession error = %v", err)
	}

	err = service.RevokeSession(context.Background(), session.AccessToken, "sess_other")

	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("err = %v", err)
	}
}

func TestCreatePasswordSessionRejectsInvalidCredentials(t *testing.T) {
	service := newTestService()

	_, err := service.CreatePasswordSession(context.Background(), domain.PasswordSessionInput{
		Identifier: "teacher@example.com",
		Password:   "bad",
		EntryPoint: domain.EntryPointDesktopTeacher,
	})

	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatalf("err = %v", err)
	}
}

func newTestService() *usecase.IdentityService {
	return newTestServiceWithIssuer(fixedIssuer{})
}

func newTestServiceWithIssuer(issuer usecase.TokenIssuer) *usecase.IdentityService {
	return newTestServiceWithWeChat(nil, issuer)
}

func newTestServiceWithWeChat(wechat usecase.WeChatAuthenticator, issuer usecase.TokenIssuer) *usecase.IdentityService {
	return usecase.NewIdentityServiceWithWeChat(
		&fakeAuthenticator{},
		wechat,
		usecase.NewMemorySessionStore(),
		issuer,
		fixedClock{now: time.Date(2026, 5, 28, 8, 0, 0, 0, time.UTC)},
	)
}

func assertHasScope(t *testing.T, principal domain.PrincipalContext, scope domain.Scope) {
	t.Helper()
	for _, item := range principal.Scopes {
		if item == scope {
			return
		}
	}
	t.Fatalf("principal missing scope %s in %#v", scope, principal.Scopes)
}

func assertNoScope(t *testing.T, principal domain.PrincipalContext, scope domain.Scope) {
	t.Helper()
	for _, item := range principal.Scopes {
		if item == scope {
			t.Fatalf("principal unexpectedly has scope %s in %#v", scope, principal.Scopes)
		}
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

func (fixedIssuer) NewSessionID() string    { return "sess_test" }
func (fixedIssuer) NewAccessToken() string  { return "access_test" }
func (fixedIssuer) NewRefreshToken() string { return "refresh_test" }
func (fixedIssuer) NewGrantToken() string   { return "grant_test" }

type sequenceIssuer struct {
	session int
	access  int
	refresh int
	grant   int
}

func (s *sequenceIssuer) NewSessionID() string {
	s.session += 1
	return "sess_seq_" + string(rune('0'+s.session))
}

func (s *sequenceIssuer) NewAccessToken() string {
	s.access += 1
	return "access_seq_" + string(rune('0'+s.access))
}

func (s *sequenceIssuer) NewRefreshToken() string {
	s.refresh += 1
	return "refresh_seq_" + string(rune('0'+s.refresh))
}

func (s *sequenceIssuer) NewGrantToken() string {
	s.grant += 1
	return "grant_seq_" + string(rune('0'+s.grant))
}

type fixedClock struct {
	now time.Time
}

func (f fixedClock) Now() time.Time {
	return f.now
}
