package bootstrap

import (
	"context"
	"net/url"
	"strings"
	"sync"
	"time"

	"ita-refactor/services/identity-access-gateway/internal/domain"
)

type WeChatAuthenticator struct {
	callbackCode string
	mu           sync.Mutex
	pending      map[string]wechatPendingLogin
}

type wechatPendingLogin struct {
	Input     domain.WeChatSessionStartInput
	ExpiresAt time.Time
}

func NewWeChatAuthenticator(callbackCode string) *WeChatAuthenticator {
	code := strings.TrimSpace(callbackCode)
	if code == "" {
		code = "ueacd"
	}
	return &WeChatAuthenticator{
		callbackCode: code,
		pending:      map[string]wechatPendingLogin{},
	}
}

func (a *WeChatAuthenticator) StartWeChatLogin(
	_ context.Context,
	input domain.WeChatSessionStartInput,
	state string,
	expiresAt time.Time,
) (domain.WeChatLoginChallenge, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.pending[state] = wechatPendingLogin{Input: input, ExpiresAt: expiresAt}

	values := url.Values{}
	values.Set("state", state)
	if input.RedirectURI != "" {
		values.Set("redirect_uri", input.RedirectURI)
	}
	return domain.WeChatLoginChallenge{
		State:     state,
		AuthURL:   "https://wechat.local/qr?" + values.Encode(),
		ExpiresAt: expiresAt,
	}, nil
}

func (a *WeChatAuthenticator) CompleteWeChatLogin(
	_ context.Context,
	input domain.WeChatSessionCallbackInput,
) (domain.Account, domain.Role, domain.EntryPoint, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	pending, ok := a.pending[input.State]
	if !ok || input.Code != a.callbackCode || time.Now().UTC().After(pending.ExpiresAt) {
		return domain.Account{}, "", "", domain.ErrInvalidCredentials
	}
	delete(a.pending, input.State)

	if pending.Input.RequestedRole == domain.RoleAdmin {
		return domain.Account{ID: "wechat_admin_bootstrap", Role: domain.RoleAdmin, DisplayName: "WeChat Admin"}, domain.RoleAdmin, pending.Input.EntryPoint, nil
	}
	return domain.Account{ID: "wechat_teacher_bootstrap", Role: domain.RoleTeacher, DisplayName: "WeChat Teacher"}, domain.RoleTeacher, pending.Input.EntryPoint, nil
}
