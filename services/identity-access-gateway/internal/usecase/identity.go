package usecase

import (
	"context"
	"sync"
	"time"

	"ita-refactor/services/identity-access-gateway/internal/domain"
)

type PasswordAuthenticator interface {
	AuthenticatePassword(ctx context.Context, input domain.PasswordSessionInput) (domain.Account, error)
}

type WeChatAuthenticator interface {
	StartWeChatLogin(
		ctx context.Context,
		input domain.WeChatSessionStartInput,
		state string,
		expiresAt time.Time,
	) (domain.WeChatLoginChallenge, error)
	CompleteWeChatLogin(ctx context.Context, input domain.WeChatSessionCallbackInput) (domain.Account, domain.Role, domain.EntryPoint, error)
}

type RemoteCommandReplayGuard interface {
	AcceptRemoteCommand(
		ctx context.Context,
		provider domain.ChannelProvider,
		externalSubjectID string,
		nonce string,
		now time.Time,
		expiresAt time.Time,
	) error
}

type SessionStore interface {
	SaveSession(ctx context.Context, accessToken string, refreshToken string, principal domain.PrincipalContext) error
	GetPrincipalByAccessToken(ctx context.Context, accessToken string) (domain.PrincipalContext, bool, error)
	RotateSession(ctx context.Context, refreshToken string, newAccessToken string, newRefreshToken string, principal domain.PrincipalContext) error
	GetPrincipalByRefreshToken(ctx context.Context, refreshToken string) (domain.PrincipalContext, bool, error)
	RevokeSession(ctx context.Context, sessionID string) error
}

type SelfSessionRevoker interface {
	RevokeOwnSession(ctx context.Context, accessToken string, sessionID string, now time.Time) (bool, error)
}

type TokenIssuer interface {
	NewSessionID() string
	NewAccessToken() string
	NewRefreshToken() string
	NewGrantToken() string
}

type Clock interface {
	Now() time.Time
}

type IdentityService struct {
	authenticator     PasswordAuthenticator
	wechat            WeChatAuthenticator
	remoteReplayGuard RemoteCommandReplayGuard
	sessions          SessionStore
	issuer            TokenIssuer
	clock             Clock
}

func NewIdentityService(
	authenticator PasswordAuthenticator,
	sessions SessionStore,
	issuer TokenIssuer,
	clock Clock,
) *IdentityService {
	return NewIdentityServiceWithWeChatAndReplayGuard(authenticator, nil, nil, sessions, issuer, clock)
}

func NewIdentityServiceWithWeChat(
	authenticator PasswordAuthenticator,
	wechat WeChatAuthenticator,
	sessions SessionStore,
	issuer TokenIssuer,
	clock Clock,
) *IdentityService {
	return NewIdentityServiceWithWeChatAndReplayGuard(authenticator, wechat, nil, sessions, issuer, clock)
}

func NewIdentityServiceWithWeChatAndReplayGuard(
	authenticator PasswordAuthenticator,
	wechat WeChatAuthenticator,
	remoteReplayGuard RemoteCommandReplayGuard,
	sessions SessionStore,
	issuer TokenIssuer,
	clock Clock,
) *IdentityService {
	if remoteReplayGuard == nil {
		remoteReplayGuard = NewMemoryRemoteCommandReplayGuard()
	}
	return &IdentityService{
		authenticator:     authenticator,
		wechat:            wechat,
		remoteReplayGuard: remoteReplayGuard,
		sessions:          sessions,
		issuer:            issuer,
		clock:             clock,
	}
}

func (s *IdentityService) CreatePasswordSession(
	ctx context.Context,
	input domain.PasswordSessionInput,
) (domain.Session, error) {
	normalized, err := domain.NormalizePasswordSessionInput(input)
	if err != nil {
		return domain.Session{}, err
	}
	account, err := s.authenticator.AuthenticatePassword(ctx, normalized)
	if err != nil {
		return domain.Session{}, err
	}
	role := normalized.RequestedRole
	if role == "" {
		role = account.Role
	}
	if role != account.Role {
		return domain.Session{}, domain.ErrForbidden
	}

	now := s.clock.Now().UTC()
	expiresAt := now.Add(time.Hour)
	principal, err := projectUserPrincipal(account, role, normalized.EntryPoint, s.issuer.NewSessionID(), now, expiresAt)
	if err != nil {
		return domain.Session{}, err
	}

	session := domain.Session{
		AccessToken:  s.issuer.NewAccessToken(),
		RefreshToken: s.issuer.NewRefreshToken(),
		TokenType:    "Bearer",
		ExpiresIn:    int(expiresAt.Sub(now).Seconds()),
		Principal:    principal,
	}
	if err := s.sessions.SaveSession(ctx, session.AccessToken, session.RefreshToken, principal); err != nil {
		return domain.Session{}, err
	}
	return session, nil
}

func (s *IdentityService) StartWeChatSession(
	ctx context.Context,
	input domain.WeChatSessionStartInput,
) (domain.WeChatLoginChallenge, error) {
	normalized, err := domain.NormalizeWeChatSessionStartInput(input)
	if err != nil {
		return domain.WeChatLoginChallenge{}, err
	}
	if s.wechat == nil {
		return domain.WeChatLoginChallenge{}, domain.ErrInvalidCredentials
	}
	expiresAt := s.clock.Now().UTC().Add(5 * time.Minute)
	return s.wechat.StartWeChatLogin(ctx, normalized, s.issuer.NewGrantToken(), expiresAt)
}

func (s *IdentityService) CompleteWeChatSession(
	ctx context.Context,
	input domain.WeChatSessionCallbackInput,
) (domain.Session, error) {
	normalized, err := domain.NormalizeWeChatSessionCallbackInput(input)
	if err != nil {
		return domain.Session{}, err
	}
	if s.wechat == nil {
		return domain.Session{}, domain.ErrInvalidCredentials
	}
	account, role, entryPoint, err := s.wechat.CompleteWeChatLogin(ctx, normalized)
	if err != nil {
		return domain.Session{}, err
	}
	if role == "" {
		role = account.Role
	}
	if role != account.Role {
		return domain.Session{}, domain.ErrForbidden
	}
	now := s.clock.Now().UTC()
	expiresAt := now.Add(time.Hour)
	principal, err := projectUserPrincipal(account, role, entryPoint, s.issuer.NewSessionID(), now, expiresAt)
	if err != nil {
		return domain.Session{}, err
	}
	session := domain.Session{
		AccessToken:  s.issuer.NewAccessToken(),
		RefreshToken: s.issuer.NewRefreshToken(),
		TokenType:    "Bearer",
		ExpiresIn:    int(expiresAt.Sub(now).Seconds()),
		Principal:    principal,
	}
	if err := s.sessions.SaveSession(ctx, session.AccessToken, session.RefreshToken, principal); err != nil {
		return domain.Session{}, err
	}
	return session, nil
}

func (s *IdentityService) GetPrincipal(
	ctx context.Context,
	accessToken string,
) (domain.PrincipalContext, error) {
	if accessToken == "" {
		return domain.PrincipalContext{}, domain.ErrInvalidSession
	}
	principal, ok, err := s.sessions.GetPrincipalByAccessToken(ctx, accessToken)
	if err != nil {
		return domain.PrincipalContext{}, err
	}
	if !ok || principal.ExpiresAt.Before(s.clock.Now().UTC()) {
		return domain.PrincipalContext{}, domain.ErrInvalidSession
	}
	return principal, nil
}

func (s *IdentityService) RefreshSession(
	ctx context.Context,
	refreshToken string,
) (domain.Session, error) {
	normalized, err := domain.NormalizeRefreshSessionInput(domain.RefreshSessionInput{RefreshToken: refreshToken})
	if err != nil {
		return domain.Session{}, err
	}
	principal, ok, err := s.sessions.GetPrincipalByRefreshToken(ctx, normalized.RefreshToken)
	if err != nil {
		return domain.Session{}, err
	}
	now := s.clock.Now().UTC()
	if !ok || principal.ExpiresAt.Before(now) {
		return domain.Session{}, domain.ErrInvalidSession
	}
	principal.IssuedAt = now
	principal.ExpiresAt = now.Add(time.Hour)
	session := domain.Session{
		AccessToken:  s.issuer.NewAccessToken(),
		RefreshToken: s.issuer.NewRefreshToken(),
		TokenType:    "Bearer",
		ExpiresIn:    int(principal.ExpiresAt.Sub(now).Seconds()),
		Principal:    principal,
	}
	if err := s.sessions.RotateSession(ctx, normalized.RefreshToken, session.AccessToken, session.RefreshToken, principal); err != nil {
		return domain.Session{}, err
	}
	return session, nil
}

func (s *IdentityService) RevokeSession(
	ctx context.Context,
	accessToken string,
	sessionID string,
) error {
	normalized, err := domain.NormalizeRevokeSessionInput(domain.RevokeSessionInput{
		AccessToken: accessToken,
		SessionID:   sessionID,
	})
	if err != nil {
		return err
	}
	now := s.clock.Now().UTC()
	if revoker, ok := s.sessions.(SelfSessionRevoker); ok {
		revoked, err := revoker.RevokeOwnSession(ctx, normalized.AccessToken, normalized.SessionID, now)
		if err != nil {
			return err
		}
		if revoked {
			return nil
		}
	}
	principal, err := s.GetPrincipal(ctx, normalized.AccessToken)
	if err != nil {
		return err
	}
	if principal.SessionID != normalized.SessionID && !hasScope(principal, domain.ScopeAdminSystem) {
		return domain.ErrForbidden
	}
	return s.sessions.RevokeSession(ctx, normalized.SessionID)
}

func (s *IdentityService) CreateRemoteCommandGrant(
	ctx context.Context,
	input domain.RemoteCommandGrantInput,
) (domain.RemoteCommandGrant, error) {
	normalized, err := domain.NormalizeRemoteCommandGrantInput(input)
	if err != nil {
		return domain.RemoteCommandGrant{}, err
	}
	now := s.clock.Now().UTC()
	issuedAt := normalized.IssuedAt.UTC()
	if err := validateRemoteCommandIssuedAt(issuedAt, now); err != nil {
		return domain.RemoteCommandGrant{}, err
	}
	expiresAt := now.Add(remoteCommandGrantTTL)
	if s.remoteReplayGuard == nil {
		return domain.RemoteCommandGrant{}, domain.ErrInvalidCredentials
	}
	if err := s.remoteReplayGuard.AcceptRemoteCommand(
		ctx,
		normalized.Provider,
		normalized.ExternalSubjectID,
		normalized.Nonce,
		now,
		expiresAt,
	); err != nil {
		return domain.RemoteCommandGrant{}, err
	}
	principal := domain.PrincipalContext{
		PrincipalID:             "remote:" + string(normalized.Provider) + ":" + normalized.ExternalSubjectID,
		SubjectType:             domain.SubjectRemoteChannel,
		Role:                    domain.RoleRemoteOperator,
		EntryPoint:              domain.EntryPointRemoteSocial,
		DisplayName:             string(normalized.Provider) + " remote operator",
		Scopes:                  []domain.Scope{domain.ScopeIdentityRead, domain.ScopeAgentCommandSubmit},
		KnowledgeAccess:         domain.KnowledgeAccess{Public: false, Private: domain.PrivateAccessNone},
		StudentAccess:           domain.StudentAccess{Mode: domain.StudentAccessNone},
		Channel:                 &domain.ChannelContext{Provider: normalized.Provider, ExternalSubjectID: normalized.ExternalSubjectID},
		RequiresHarnessApproval: true,
		SessionID:               s.issuer.NewSessionID(),
		IssuedAt:                now,
		ExpiresAt:               expiresAt,
	}
	grant := domain.RemoteCommandGrant{
		GrantToken: s.issuer.NewGrantToken(),
		ExpiresAt:  expiresAt,
		Principal:  principal,
	}
	if err := s.sessions.SaveSession(ctx, grant.GrantToken, "", principal); err != nil {
		return domain.RemoteCommandGrant{}, err
	}
	return grant, nil
}

const (
	remoteCommandGrantTTL           = 10 * time.Minute
	remoteCommandIssuedAtMaxAge     = 2 * time.Minute
	remoteCommandIssuedAtFutureSkew = 30 * time.Second
)

func validateRemoteCommandIssuedAt(issuedAt time.Time, now time.Time) error {
	if issuedAt.Before(now.Add(-remoteCommandIssuedAtMaxAge)) {
		return domain.ErrValidation
	}
	if issuedAt.After(now.Add(remoteCommandIssuedAtFutureSkew)) {
		return domain.ErrValidation
	}
	return nil
}

func projectUserPrincipal(
	account domain.Account,
	role domain.Role,
	entryPoint domain.EntryPoint,
	sessionID string,
	issuedAt time.Time,
	expiresAt time.Time,
) (domain.PrincipalContext, error) {
	base := domain.PrincipalContext{
		PrincipalID:             account.ID,
		SubjectType:             domain.SubjectUser,
		Role:                    role,
		EntryPoint:              entryPoint,
		DisplayName:             account.DisplayName,
		RequiresHarnessApproval: false,
		SessionID:               sessionID,
		IssuedAt:                issuedAt,
		ExpiresAt:               expiresAt,
	}

	switch {
	case role == domain.RoleTeacher && entryPoint == domain.EntryPointDesktopTeacher:
		base.Scopes = []domain.Scope{
			domain.ScopeIdentityRead,
			domain.ScopeTeachingRead,
			domain.ScopeTeachingWrite,
			domain.ScopeResearchRead,
			domain.ScopeStudentAssignedRead,
			domain.ScopeStudentArchiveWrite,
			domain.ScopeKnowledgePublicRead,
			domain.ScopeKnowledgePrivateRead,
			domain.ScopeAgentCommandSubmit,
		}
		base.KnowledgeAccess = domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessAssigned}
		base.StudentAccess = domain.StudentAccess{Mode: domain.StudentAccessAssigned}
	case role == domain.RoleTeacher && entryPoint == domain.EntryPointDesktopResearch:
		base.Scopes = []domain.Scope{
			domain.ScopeIdentityRead,
			domain.ScopeResearchRead,
			domain.ScopeResearchWrite,
			domain.ScopeKnowledgePublicRead,
			domain.ScopeKnowledgePrivateRead,
			domain.ScopeAgentCommandSubmit,
		}
		base.KnowledgeAccess = domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessOwn}
		base.StudentAccess = domain.StudentAccess{Mode: domain.StudentAccessNone}
	case role == domain.RoleStudent && entryPoint == domain.EntryPointStudentApp:
		base.Scopes = []domain.Scope{
			domain.ScopeIdentityRead,
			domain.ScopeTeachingRead,
			domain.ScopeStudentOwnRead,
			domain.ScopeStudentOwnWrite,
			domain.ScopeKnowledgePublicRead,
		}
		base.KnowledgeAccess = domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessNone}
		base.StudentAccess = domain.StudentAccess{Mode: domain.StudentAccessOwn, StudentIDs: []string{account.ID}}
	case role == domain.RoleAdmin:
		base.Scopes = []domain.Scope{
			domain.ScopeIdentityRead,
			domain.ScopeTeachingRead,
			domain.ScopeTeachingWrite,
			domain.ScopeResearchRead,
			domain.ScopeResearchWrite,
			domain.ScopeStudentAssignedRead,
			domain.ScopeStudentArchiveWrite,
			domain.ScopeKnowledgePublicRead,
			domain.ScopeKnowledgePrivateRead,
			domain.ScopeAgentCommandSubmit,
			domain.ScopeHarnessApprove,
			domain.ScopeDeviceLocalControl,
			domain.ScopeAdminSystem,
		}
		base.KnowledgeAccess = domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessAll}
		base.StudentAccess = domain.StudentAccess{Mode: domain.StudentAccessAll}
	default:
		return domain.PrincipalContext{}, domain.ErrForbidden
	}
	return base, nil
}

func hasScope(principal domain.PrincipalContext, scope domain.Scope) bool {
	for _, item := range principal.Scopes {
		if item == scope {
			return true
		}
	}
	return false
}

type MemoryRemoteCommandReplayGuard struct {
	mu       sync.Mutex
	accepted map[remoteCommandReplayKey]time.Time
}

type remoteCommandReplayKey struct {
	provider          domain.ChannelProvider
	externalSubjectID string
	nonce             string
}

func NewMemoryRemoteCommandReplayGuard() *MemoryRemoteCommandReplayGuard {
	return &MemoryRemoteCommandReplayGuard{accepted: map[remoteCommandReplayKey]time.Time{}}
}

func (g *MemoryRemoteCommandReplayGuard) AcceptRemoteCommand(
	_ context.Context,
	provider domain.ChannelProvider,
	externalSubjectID string,
	nonce string,
	now time.Time,
	expiresAt time.Time,
) error {
	if !expiresAt.After(now) {
		return domain.ErrValidation
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	g.pruneExpiredLocked(now.UTC())

	key := remoteCommandReplayKey{
		provider:          provider,
		externalSubjectID: externalSubjectID,
		nonce:             nonce,
	}
	if _, ok := g.accepted[key]; ok {
		return domain.ErrInvalidCredentials
	}
	g.accepted[key] = expiresAt.UTC()
	return nil
}

func (g *MemoryRemoteCommandReplayGuard) pruneExpiredLocked(now time.Time) {
	for key, expiresAt := range g.accepted {
		if !expiresAt.After(now) {
			delete(g.accepted, key)
		}
	}
}

type MemorySessionStore struct {
	mu               sync.RWMutex
	byAccessToken    map[string]domain.PrincipalContext
	byRefreshToken   map[string]domain.PrincipalContext
	accessBySession  map[string]string
	refreshBySession map[string]string
}

func NewMemorySessionStore() *MemorySessionStore {
	return &MemorySessionStore{
		byAccessToken:    map[string]domain.PrincipalContext{},
		byRefreshToken:   map[string]domain.PrincipalContext{},
		accessBySession:  map[string]string{},
		refreshBySession: map[string]string{},
	}
}

func (s *MemorySessionStore) SaveSession(_ context.Context, accessToken string, refreshToken string, principal domain.PrincipalContext) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.saveLocked(accessToken, refreshToken, principal)
	return nil
}

func (s *MemorySessionStore) GetPrincipalByAccessToken(_ context.Context, accessToken string) (domain.PrincipalContext, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	principal, ok := s.byAccessToken[accessToken]
	return principal, ok, nil
}

func (s *MemorySessionStore) GetPrincipalByRefreshToken(_ context.Context, refreshToken string) (domain.PrincipalContext, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	principal, ok := s.byRefreshToken[refreshToken]
	return principal, ok, nil
}

func (s *MemorySessionStore) RotateSession(_ context.Context, refreshToken string, newAccessToken string, newRefreshToken string, principal domain.PrincipalContext) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	oldPrincipal, ok := s.byRefreshToken[refreshToken]
	if !ok {
		return domain.ErrInvalidSession
	}
	s.revokeLocked(oldPrincipal.SessionID)
	s.saveLocked(newAccessToken, newRefreshToken, principal)
	return nil
}

func (s *MemorySessionStore) RevokeSession(_ context.Context, sessionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.revokeLocked(sessionID)
	return nil
}

func (s *MemorySessionStore) RevokeOwnSession(_ context.Context, accessToken string, sessionID string, now time.Time) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	principal, ok := s.byAccessToken[accessToken]
	if !ok || principal.SessionID != sessionID || principal.ExpiresAt.Before(now) {
		return false, nil
	}
	s.revokeLocked(sessionID)
	return true, nil
}

func (s *MemorySessionStore) saveLocked(accessToken string, refreshToken string, principal domain.PrincipalContext) {
	s.byAccessToken[accessToken] = principal
	s.accessBySession[principal.SessionID] = accessToken
	if refreshToken != "" {
		s.byRefreshToken[refreshToken] = principal
		s.refreshBySession[principal.SessionID] = refreshToken
	}
}

func (s *MemorySessionStore) revokeLocked(sessionID string) {
	if accessToken := s.accessBySession[sessionID]; accessToken != "" {
		delete(s.byAccessToken, accessToken)
		delete(s.accessBySession, sessionID)
	}
	if refreshToken := s.refreshBySession[sessionID]; refreshToken != "" {
		delete(s.byRefreshToken, refreshToken)
		delete(s.refreshBySession, sessionID)
	}
}
