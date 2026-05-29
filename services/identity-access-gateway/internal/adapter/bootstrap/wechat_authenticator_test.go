package bootstrap_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/identity-access-gateway/internal/adapter/bootstrap"
	"ita-refactor/services/identity-access-gateway/internal/domain"
)

func TestWeChatAuthenticatorCompletesPendingLogin(t *testing.T) {
	authenticator := bootstrap.NewWeChatAuthenticator("ueacd")
	expiresAt := time.Now().UTC().Add(time.Minute)

	challenge, err := authenticator.StartWeChatLogin(context.Background(), domain.WeChatSessionStartInput{
		RequestedRole: domain.RoleTeacher,
		EntryPoint:    domain.EntryPointDesktopTeacher,
		RedirectURI:   "ita://auth/wechat",
	}, "state_test_123", expiresAt)
	if err != nil {
		t.Fatalf("StartWeChatLogin error = %v", err)
	}
	if challenge.State != "state_test_123" || !strings.Contains(challenge.AuthURL, "state=state_test_123") {
		t.Fatalf("challenge = %#v", challenge)
	}

	account, role, entryPoint, err := authenticator.CompleteWeChatLogin(context.Background(), domain.WeChatSessionCallbackInput{
		State: "state_test_123",
		Code:  "ueacd",
	})
	if err != nil {
		t.Fatalf("CompleteWeChatLogin error = %v", err)
	}
	if account.Role != domain.RoleTeacher || role != domain.RoleTeacher || entryPoint != domain.EntryPointDesktopTeacher {
		t.Fatalf("account=%#v role=%s entryPoint=%s", account, role, entryPoint)
	}
}

func TestWeChatAuthenticatorRejectsInvalidCode(t *testing.T) {
	authenticator := bootstrap.NewWeChatAuthenticator("ueacd")
	if _, err := authenticator.StartWeChatLogin(context.Background(), domain.WeChatSessionStartInput{
		RequestedRole: domain.RoleAdmin,
		EntryPoint:    domain.EntryPointDesktopTeacher,
	}, "state_test_123", time.Now().UTC().Add(time.Minute)); err != nil {
		t.Fatalf("StartWeChatLogin error = %v", err)
	}

	_, _, _, err := authenticator.CompleteWeChatLogin(context.Background(), domain.WeChatSessionCallbackInput{
		State: "state_test_123",
		Code:  "wrong",
	})

	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatalf("err = %v", err)
	}
}
