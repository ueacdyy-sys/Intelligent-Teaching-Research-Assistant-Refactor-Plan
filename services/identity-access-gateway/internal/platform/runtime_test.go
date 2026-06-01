package platform_test

import (
	"strings"
	"testing"

	"ita-refactor/services/identity-access-gateway/internal/platform"
)

func TestTokenIssuerBatchedSessionTokensKeepPrefixesAndDistinctValues(t *testing.T) {
	issuer := platform.TokenIssuer{}

	sessionID, accessToken, refreshToken := issuer.NewUserSessionTokens()

	if !strings.HasPrefix(sessionID, "sess_") {
		t.Fatalf("session id prefix = %q", sessionID)
	}
	if !strings.HasPrefix(accessToken, "access_") {
		t.Fatalf("access token prefix = %q", accessToken)
	}
	if !strings.HasPrefix(refreshToken, "refresh_") {
		t.Fatalf("refresh token prefix = %q", refreshToken)
	}
	if sessionID == accessToken || sessionID == refreshToken || accessToken == refreshToken {
		t.Fatalf("batched tokens must be distinct: %q %q %q", sessionID, accessToken, refreshToken)
	}
}

func TestTokenIssuerBatchedAccessRefreshTokensKeepPrefixesAndDistinctValues(t *testing.T) {
	issuer := platform.TokenIssuer{}

	accessToken, refreshToken := issuer.NewAccessRefreshTokens()

	if !strings.HasPrefix(accessToken, "access_") {
		t.Fatalf("access token prefix = %q", accessToken)
	}
	if !strings.HasPrefix(refreshToken, "refresh_") {
		t.Fatalf("refresh token prefix = %q", refreshToken)
	}
	if accessToken == refreshToken {
		t.Fatalf("batched access and refresh tokens must be distinct: %q", accessToken)
	}
}
