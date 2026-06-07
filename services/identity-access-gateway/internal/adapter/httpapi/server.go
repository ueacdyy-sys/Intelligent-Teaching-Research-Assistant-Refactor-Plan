package httpapi

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ita-refactor/services/identity-access-gateway/internal/domain"
	"ita-refactor/services/identity-access-gateway/internal/platform"
	"ita-refactor/services/identity-access-gateway/internal/usecase"
)

type Server struct {
	identity                   *usecase.IdentityService
	channelSignature           string
	diagnosticsSecret          string
	sessionDBPoolStatsProvider platform.SessionDBPoolStatsProvider
}

type ServerConfig struct {
	Identity                   *usecase.IdentityService
	ChannelSignature           string
	DiagnosticsSecret          string
	SessionDBPoolStatsProvider platform.SessionDBPoolStatsProvider
}

type passwordSessionRequest struct {
	Identifier    string            `json:"identifier"`
	Password      string            `json:"password"`
	RequestedRole domain.Role       `json:"requestedRole,omitempty"`
	EntryPoint    domain.EntryPoint `json:"entryPoint"`
}

type wechatSessionStartRequest struct {
	RequestedRole domain.Role       `json:"requestedRole,omitempty"`
	EntryPoint    domain.EntryPoint `json:"entryPoint"`
	RedirectURI   string            `json:"redirectUri,omitempty"`
}

type wechatSessionStartResponse struct {
	State     string `json:"state"`
	AuthURL   string `json:"authUrl"`
	ExpiresAt string `json:"expiresAt"`
}

type wechatSessionCallbackRequest struct {
	State string `json:"state"`
	Code  string `json:"code"`
}

type remoteCommandGrantRequest struct {
	Provider          domain.ChannelProvider `json:"provider"`
	ExternalSubjectID string                 `json:"externalSubjectId"`
	CommandPreview    string                 `json:"commandPreview"`
	Nonce             string                 `json:"nonce"`
	IssuedAt          string                 `json:"issuedAt"`
}

type refreshSessionRequest struct {
	RefreshToken string `json:"refreshToken"`
}

type sessionResponse struct {
	AccessToken  string              `json:"accessToken"`
	RefreshToken string              `json:"refreshToken"`
	TokenType    string              `json:"tokenType"`
	ExpiresIn    int                 `json:"expiresIn"`
	Principal    principalContextDTO `json:"principal"`
}

type principalResponse struct {
	Principal principalContextDTO `json:"principal"`
}

type remoteCommandGrantResponse struct {
	GrantToken string              `json:"grantToken"`
	ExpiresAt  string              `json:"expiresAt"`
	Principal  principalContextDTO `json:"principal"`
}

type principalContextDTO struct {
	PrincipalID             string             `json:"principalId"`
	SubjectType             domain.SubjectType `json:"subjectType"`
	Role                    domain.Role        `json:"role"`
	EntryPoint              domain.EntryPoint  `json:"entryPoint"`
	DisplayName             *string            `json:"displayName"`
	Scopes                  []domain.Scope     `json:"scopes"`
	KnowledgeAccess         knowledgeAccessDTO `json:"knowledgeAccess"`
	StudentAccess           studentAccessDTO   `json:"studentAccess"`
	Channel                 *channelContextDTO `json:"channel,omitempty"`
	RequiresHarnessApproval bool               `json:"requiresHarnessApproval"`
	SessionID               string             `json:"sessionId"`
	IssuedAt                string             `json:"issuedAt"`
	ExpiresAt               string             `json:"expiresAt"`
}

type knowledgeAccessDTO struct {
	Public  bool                          `json:"public"`
	Private domain.PrivateKnowledgeAccess `json:"private"`
}

type studentAccessDTO struct {
	Mode       domain.StudentAccessMode `json:"mode"`
	StudentIDs []string                 `json:"studentIds,omitempty"`
}

type channelContextDTO struct {
	Provider          domain.ChannelProvider `json:"provider"`
	ExternalSubjectID string                 `json:"externalSubjectId"`
	DeviceName        *string                `json:"deviceName,omitempty"`
}

type errorResponse struct {
	Error apiError `json:"error"`
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func NewServer(identity *usecase.IdentityService, channelSignature string) *Server {
	return NewServerWithConfig(ServerConfig{
		Identity:         identity,
		ChannelSignature: channelSignature,
	})
}

func NewServerWithConfig(config ServerConfig) *Server {
	return &Server{
		identity:                   config.Identity,
		channelSignature:           config.ChannelSignature,
		diagnosticsSecret:          config.DiagnosticsSecret,
		sessionDBPoolStatsProvider: config.SessionDBPoolStatsProvider,
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.health)
	mux.HandleFunc("/internal/identity/session-db-pool", s.sessionDBPoolDiagnostics)
	mux.HandleFunc("/v1/identity/sessions/password", s.createPasswordSession)
	mux.HandleFunc("/v1/identity/sessions/wechat", s.startWeChatSession)
	mux.HandleFunc("/v1/identity/sessions/wechat/callback", s.completeWeChatSession)
	mux.HandleFunc("/v1/identity/sessions/refresh", s.refreshSession)
	mux.HandleFunc("/v1/identity/sessions/", s.sessionByID)
	mux.HandleFunc("/v1/identity/principal", s.getPrincipal)
	mux.HandleFunc("/v1/student-app/profile", s.getStudentAppProfile)
	mux.HandleFunc("/v1/identity/remote-command-grants", s.createRemoteCommandGrant)
	return mux
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "identity-access-gateway"})
}

func (s *Server) sessionDBPoolDiagnostics(w http.ResponseWriter, r *http.Request) {
	if s.sessionDBPoolStatsProvider == nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "diagnostics unavailable")
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if !constantTimeEquals(r.Header.Get("X-Internal-Diagnostics-Secret"), s.diagnosticsSecret) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid diagnostics secret")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"service": "identity-access-gateway",
		"stats":   s.sessionDBPoolStatsProvider.SessionDBPoolStats(),
	})
}

func (s *Server) createPasswordSession(w http.ResponseWriter, r *http.Request) {
	handlerStart := time.Now()
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	var request passwordSessionRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	preUsecaseDuration := time.Since(handlerStart)
	appStart := time.Now()
	session, err := s.identity.CreatePasswordSession(r.Context(), domain.PasswordSessionInput{
		Identifier:    request.Identifier,
		Password:      request.Password,
		RequestedRole: request.RequestedRole,
		EntryPoint:    request.EntryPoint,
	})
	appDuration := time.Since(appStart)
	if handleUsecaseError(w, err) {
		return
	}
	writeIdentityJSON(w, http.StatusCreated, toSessionResponse(session), handlerStart, preUsecaseDuration, appDuration)
}

func (s *Server) startWeChatSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	var request wechatSessionStartRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	challenge, err := s.identity.StartWeChatSession(r.Context(), domain.WeChatSessionStartInput{
		RequestedRole: request.RequestedRole,
		EntryPoint:    request.EntryPoint,
		RedirectURI:   request.RedirectURI,
	})
	if handleUsecaseError(w, err) {
		return
	}
	writeJSON(w, http.StatusAccepted, wechatSessionStartResponse{
		State:     challenge.State,
		AuthURL:   challenge.AuthURL,
		ExpiresAt: formatTime(challenge.ExpiresAt),
	})
}

func (s *Server) completeWeChatSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	var request wechatSessionCallbackRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	session, err := s.identity.CompleteWeChatSession(r.Context(), domain.WeChatSessionCallbackInput{
		State: request.State,
		Code:  request.Code,
	})
	if handleUsecaseError(w, err) {
		return
	}
	writeJSON(w, http.StatusCreated, toSessionResponse(session))
}

func (s *Server) refreshSession(w http.ResponseWriter, r *http.Request) {
	handlerStart := time.Now()
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	var request refreshSessionRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	preUsecaseDuration := time.Since(handlerStart)
	appStart := time.Now()
	session, err := s.identity.RefreshSession(r.Context(), request.RefreshToken)
	appDuration := time.Since(appStart)
	if handleUsecaseError(w, err) {
		return
	}
	writeIdentityJSON(w, http.StatusOK, toSessionResponse(session), handlerStart, preUsecaseDuration, appDuration)
}

func (s *Server) sessionByID(w http.ResponseWriter, r *http.Request) {
	handlerStart := time.Now()
	sessionID := strings.TrimPrefix(r.URL.Path, "/v1/identity/sessions/")
	if sessionID == "" || strings.Contains(sessionID, "/") {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "session not found")
		return
	}
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	token := bearerToken(r.Header.Get("Authorization"))
	if token == "" {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing bearer token")
		return
	}
	preUsecaseDuration := time.Since(handlerStart)
	appStart := time.Now()
	if err := s.identity.RevokeSession(r.Context(), token, sessionID); handleUsecaseError(w, err) {
		return
	}
	writeIdentityServerTiming(w, time.Since(handlerStart), preUsecaseDuration, time.Since(appStart), 0)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) getPrincipal(w http.ResponseWriter, r *http.Request) {
	handlerStart := time.Now()
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	token := bearerToken(r.Header.Get("Authorization"))
	if token == "" {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing bearer token")
		return
	}
	preUsecaseDuration := time.Since(handlerStart)
	appStart := time.Now()
	principal, err := s.identity.GetPrincipal(r.Context(), token)
	appDuration := time.Since(appStart)
	if handleUsecaseError(w, err) {
		return
	}
	writeIdentityJSON(w, http.StatusOK, principalResponse{Principal: toPrincipalDTO(principal)}, handlerStart, preUsecaseDuration, appDuration)
}

func (s *Server) createRemoteCommandGrant(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if s.channelSignature != "" && r.Header.Get("X-Channel-Signature") != s.channelSignature {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid channel signature")
		return
	}
	var request remoteCommandGrantRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	issuedAt, err := time.Parse(time.RFC3339, request.IssuedAt)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "issuedAt must be an RFC3339 timestamp")
		return
	}
	grant, err := s.identity.CreateRemoteCommandGrant(r.Context(), domain.RemoteCommandGrantInput{
		Provider:          request.Provider,
		ExternalSubjectID: request.ExternalSubjectID,
		CommandPreview:    request.CommandPreview,
		Nonce:             request.Nonce,
		IssuedAt:          issuedAt,
	})
	if handleUsecaseError(w, err) {
		return
	}
	writeJSON(w, http.StatusCreated, remoteCommandGrantResponse{
		GrantToken: grant.GrantToken,
		ExpiresAt:  formatTime(grant.ExpiresAt),
		Principal:  toPrincipalDTO(grant.Principal),
	})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "invalid request body")
		return false
	}
	return true
}

func handleUsecaseError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	switch {
	case errors.Is(err, domain.ErrValidation):
		writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
	case errors.Is(err, domain.ErrInvalidCredentials), errors.Is(err, domain.ErrInvalidSession):
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", err.Error())
	case errors.Is(err, domain.ErrForbidden):
		writeError(w, http.StatusForbidden, "FORBIDDEN", err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "identity service failed")
	}
	return true
}

func bearerToken(header string) string {
	parts := strings.SplitN(strings.TrimSpace(header), " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func constantTimeEquals(left string, right string) bool {
	if left == "" || right == "" || len(left) != len(right) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}

func toSessionResponse(session domain.Session) sessionResponse {
	return sessionResponse{
		AccessToken:  session.AccessToken,
		RefreshToken: session.RefreshToken,
		TokenType:    session.TokenType,
		ExpiresIn:    session.ExpiresIn,
		Principal:    toPrincipalDTO(session.Principal),
	}
}

func toPrincipalDTO(principal domain.PrincipalContext) principalContextDTO {
	displayName := stringPtrOrNil(principal.DisplayName)
	return principalContextDTO{
		PrincipalID: principal.PrincipalID,
		SubjectType: principal.SubjectType,
		Role:        principal.Role,
		EntryPoint:  principal.EntryPoint,
		DisplayName: displayName,
		Scopes:      principal.Scopes,
		KnowledgeAccess: knowledgeAccessDTO{
			Public:  principal.KnowledgeAccess.Public,
			Private: principal.KnowledgeAccess.Private,
		},
		StudentAccess: studentAccessDTO{
			Mode:       principal.StudentAccess.Mode,
			StudentIDs: principal.StudentAccess.StudentIDs,
		},
		Channel:                 toChannelDTO(principal.Channel),
		RequiresHarnessApproval: principal.RequiresHarnessApproval,
		SessionID:               principal.SessionID,
		IssuedAt:                formatTime(principal.IssuedAt),
		ExpiresAt:               formatTime(principal.ExpiresAt),
	}
}

func toChannelDTO(channel *domain.ChannelContext) *channelContextDTO {
	if channel == nil {
		return nil
	}
	return &channelContextDTO{
		Provider:          channel.Provider,
		ExternalSubjectID: channel.ExternalSubjectID,
		DeviceName:        stringPtrOrNil(channel.DeviceName),
	}
}

func stringPtrOrNil(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func formatTime(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	body, err := encodeJSONPayload(payload)
	if err != nil {
		writeResponseEncodingError(w)
		return
	}
	writeJSONBytes(w, status, body)
}

func writeIdentityJSON(
	w http.ResponseWriter,
	status int,
	payload any,
	handlerStart time.Time,
	preUsecaseDuration time.Duration,
	appDuration time.Duration,
) {
	encodeStart := time.Now()
	body, err := encodeJSONPayload(payload)
	responseEncodeDuration := observableDuration(time.Since(encodeStart))
	writeIdentityServerTiming(w, time.Since(handlerStart), preUsecaseDuration, appDuration, responseEncodeDuration)
	if err != nil {
		writeResponseEncodingError(w)
		return
	}
	writeJSONBytes(w, status, body)
}

func encodeJSONPayload(payload any) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return append(body, '\n'), nil
}

func writeJSONBytes(w http.ResponseWriter, status int, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

func writeResponseEncodingError(w http.ResponseWriter) {
	body := []byte(`{"error":{"code":"INTERNAL_ERROR","message":"failed to encode response"}}` + "\n")
	writeJSONBytes(w, http.StatusInternalServerError, body)
}

func writeError(w http.ResponseWriter, status int, code string, message string) {
	writeJSON(w, status, errorResponse{Error: apiError{Code: code, Message: message}})
}
