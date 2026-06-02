package usecase

import (
	"context"
	"errors"
	"strings"
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

type RefreshSessionRotator interface {
	RotateRefreshSession(
		ctx context.Context,
		refreshToken string,
		newAccessToken string,
		newRefreshToken string,
		issuedAt time.Time,
		expiresAt time.Time,
	) (domain.PrincipalContext, bool, error)
}

type TokenIssuer interface {
	NewSessionID() string
	NewAccessToken() string
	NewRefreshToken() string
	NewGrantToken() string
}

type UserSessionTokenIssuer interface {
	NewUserSessionTokens() (sessionID string, accessToken string, refreshToken string)
}

type AccessRefreshTokenIssuer interface {
	NewAccessRefreshTokens() (accessToken string, refreshToken string)
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
	revokedTokens     *revokedAccessTokenDenyCache
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
		revokedTokens:     newRevokedAccessTokenDenyCache(revokedAccessTokenDenyCacheMaxEntries),
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
	sessionID, accessToken, refreshToken := s.newUserSessionTokens()
	principal, err := projectUserPrincipal(account, role, normalized.EntryPoint, sessionID, now, expiresAt)
	if err != nil {
		return domain.Session{}, err
	}

	session := domain.Session{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
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
	sessionID, accessToken, refreshToken := s.newUserSessionTokens()
	principal, err := projectUserPrincipal(account, role, entryPoint, sessionID, now, expiresAt)
	if err != nil {
		return domain.Session{}, err
	}
	session := domain.Session{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
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
	accessToken = strings.TrimSpace(accessToken)
	if accessToken == "" {
		return domain.PrincipalContext{}, domain.ErrInvalidSession
	}
	now := s.clock.Now().UTC()
	if s.revokedTokens != nil && s.revokedTokens.contains(accessToken, now) {
		return domain.PrincipalContext{}, domain.ErrInvalidSession
	}
	principal, ok, err := s.sessions.GetPrincipalByAccessToken(ctx, accessToken)
	if err != nil {
		return domain.PrincipalContext{}, err
	}
	if !ok || principal.ExpiresAt.Before(now) {
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
	now := s.clock.Now().UTC()
	expiresAt := now.Add(time.Hour)
	if rotator, ok := s.sessions.(RefreshSessionRotator); ok {
		return s.refreshSessionWithRotator(ctx, rotator, normalized.RefreshToken, now, expiresAt)
	}

	principal, ok, err := s.sessions.GetPrincipalByRefreshToken(ctx, normalized.RefreshToken)
	if err != nil {
		return domain.Session{}, err
	}
	if !ok || principal.ExpiresAt.Before(now) {
		return domain.Session{}, domain.ErrInvalidSession
	}
	principal.IssuedAt = now
	principal.ExpiresAt = expiresAt
	accessToken, refreshToken := s.newAccessRefreshTokens()
	session := domain.Session{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    int(principal.ExpiresAt.Sub(now).Seconds()),
		Principal:    principal,
	}
	if err := s.sessions.RotateSession(ctx, normalized.RefreshToken, session.AccessToken, session.RefreshToken, principal); err != nil {
		return domain.Session{}, err
	}
	return session, nil
}

func (s *IdentityService) refreshSessionWithRotator(
	ctx context.Context,
	rotator RefreshSessionRotator,
	currentRefreshToken string,
	now time.Time,
	expiresAt time.Time,
) (domain.Session, error) {
	accessToken, refreshToken := s.newAccessRefreshTokens()
	session := domain.Session{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    int(expiresAt.Sub(now).Seconds()),
	}
	principal, ok, err := rotator.RotateRefreshSession(ctx, currentRefreshToken, session.AccessToken, session.RefreshToken, now, expiresAt)
	if err != nil {
		return domain.Session{}, err
	}
	if !ok {
		return domain.Session{}, domain.ErrInvalidSession
	}
	session.Principal = principal
	return session, nil
}

func (s *IdentityService) newUserSessionTokens() (string, string, string) {
	if issuer, ok := s.issuer.(UserSessionTokenIssuer); ok {
		return issuer.NewUserSessionTokens()
	}
	return s.issuer.NewSessionID(), s.issuer.NewAccessToken(), s.issuer.NewRefreshToken()
}

func (s *IdentityService) newAccessRefreshTokens() (string, string) {
	if issuer, ok := s.issuer.(AccessRefreshTokenIssuer); ok {
		return issuer.NewAccessRefreshTokens()
	}
	return s.issuer.NewAccessToken(), s.issuer.NewRefreshToken()
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
			s.rememberRevokedAccessToken(normalized.AccessToken, now)
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
	if err := s.sessions.RevokeSession(ctx, normalized.SessionID); err != nil {
		return err
	}
	if principal.SessionID == normalized.SessionID {
		s.rememberRevokedAccessToken(normalized.AccessToken, now)
	}
	return nil
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
	remoteCommandGrantTTL                 = 10 * time.Minute
	remoteCommandIssuedAtMaxAge           = 2 * time.Minute
	remoteCommandIssuedAtFutureSkew       = 30 * time.Second
	revokedAccessTokenDenyTTL             = 30 * time.Second
	revokedAccessTokenDenyPruneInterval   = time.Second
	revokedAccessTokenDenyPruneWriteCount = 4096
	revokedAccessTokenDenyCacheMaxEntries = 262144
)

var errDuplicateSessionID = errors.New("duplicate generated session id")

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

func (s *IdentityService) rememberRevokedAccessToken(accessToken string, now time.Time) {
	if s.revokedTokens == nil {
		return
	}
	s.revokedTokens.remember(accessToken, now.Add(revokedAccessTokenDenyTTL), now)
}

type revokedAccessTokenDenyCache struct {
	mu               sync.RWMutex
	expiresAt        map[string]time.Time
	maxEntries       int
	lastPrune        time.Time
	writesSincePrune int
}

func newRevokedAccessTokenDenyCache(maxEntries int) *revokedAccessTokenDenyCache {
	if maxEntries < 1 {
		maxEntries = 1
	}
	return &revokedAccessTokenDenyCache{
		expiresAt:  map[string]time.Time{},
		maxEntries: maxEntries,
	}
}

func (c *revokedAccessTokenDenyCache) contains(accessToken string, now time.Time) bool {
	if accessToken == "" {
		return false
	}
	now = now.UTC()
	c.mu.RLock()
	expiresAt, ok := c.expiresAt[accessToken]
	c.mu.RUnlock()
	if !ok {
		return false
	}
	if expiresAt.After(now) {
		return true
	}

	c.mu.Lock()
	if currentExpiresAt, stillPresent := c.expiresAt[accessToken]; stillPresent && !currentExpiresAt.After(now) {
		delete(c.expiresAt, accessToken)
	}
	c.mu.Unlock()
	return false
}

func (c *revokedAccessTokenDenyCache) remember(accessToken string, expiresAt time.Time, now time.Time) {
	if accessToken == "" {
		return
	}
	now = now.UTC()
	expiresAt = expiresAt.UTC()
	if !expiresAt.After(now) {
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	c.writesSincePrune += 1
	if c.shouldPruneLocked(now) {
		c.pruneExpiredLocked(now)
		c.lastPrune = now
		c.writesSincePrune = 0
	}
	if len(c.expiresAt) >= c.maxEntries {
		c.pruneExpiredLocked(now)
		if len(c.expiresAt) >= c.maxEntries {
			c.dropEarliestLocked()
		}
	}
	c.expiresAt[accessToken] = expiresAt
}

func (c *revokedAccessTokenDenyCache) shouldPruneLocked(now time.Time) bool {
	return c.lastPrune.IsZero() ||
		now.Sub(c.lastPrune) >= revokedAccessTokenDenyPruneInterval ||
		c.writesSincePrune >= revokedAccessTokenDenyPruneWriteCount
}

func (c *revokedAccessTokenDenyCache) pruneExpiredLocked(now time.Time) {
	for accessToken, expiresAt := range c.expiresAt {
		if !expiresAt.After(now) {
			delete(c.expiresAt, accessToken)
		}
	}
}

func (c *revokedAccessTokenDenyCache) dropEarliestLocked() {
	var (
		oldestToken     string
		oldestExpiresAt time.Time
	)
	for accessToken, expiresAt := range c.expiresAt {
		if oldestToken == "" || expiresAt.Before(oldestExpiresAt) {
			oldestToken = accessToken
			oldestExpiresAt = expiresAt
		}
	}
	if oldestToken != "" {
		delete(c.expiresAt, oldestToken)
	}
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
	if _, exists := s.accessBySession[principal.SessionID]; exists {
		return errDuplicateSessionID
	}
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
