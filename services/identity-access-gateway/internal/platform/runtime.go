package platform

import (
	"crypto/rand"
	"encoding/base64"
	"strings"
	"time"
	"unicode"
)

type Clock struct{}

func (Clock) Now() time.Time {
	return time.Now().UTC()
}

type TokenIssuer struct {
	OwnerID string
}

func (TokenIssuer) NewSessionID() string {
	return "sess_" + randomToken()
}

func (issuer TokenIssuer) NewAccessToken() string {
	return issuer.tokenWithOwner("access", randomToken())
}

func (issuer TokenIssuer) NewRefreshToken() string {
	return issuer.tokenWithOwner("refresh", randomToken())
}

func (TokenIssuer) NewGrantToken() string {
	return "grant_" + randomToken()
}

func (issuer TokenIssuer) NewUserSessionTokens() (string, string, string) {
	tokens := randomTokens(3)
	return "sess_" + tokens[0], issuer.tokenWithOwner("access", tokens[1]), issuer.tokenWithOwner("refresh", tokens[2])
}

func (issuer TokenIssuer) NewAccessRefreshTokens() (string, string) {
	tokens := randomTokens(2)
	return issuer.tokenWithOwner("access", tokens[0]), issuer.tokenWithOwner("refresh", tokens[1])
}

func (issuer TokenIssuer) tokenWithOwner(prefix string, token string) string {
	owner := normalizeTokenOwner(issuer.OwnerID)
	if owner == "" {
		return prefix + "_" + token
	}
	return prefix + "_" + owner + "_" + token
}

func normalizeTokenOwner(owner string) string {
	owner = strings.TrimSpace(owner)
	if owner == "" {
		return ""
	}
	var builder strings.Builder
	for _, char := range owner {
		if unicode.IsLetter(char) || unicode.IsDigit(char) {
			builder.WriteRune(unicode.ToLower(char))
		}
	}
	return builder.String()
}

func randomToken() string {
	return randomTokens(1)[0]
}

func randomTokens(count int) []string {
	buffer := make([]byte, count*tokenRandomBytes)
	if _, err := rand.Read(buffer); err != nil {
		panic(err)
	}
	tokens := make([]string, count)
	for index := 0; index < count; index++ {
		start := index * tokenRandomBytes
		end := start + tokenRandomBytes
		tokens[index] = base64.RawURLEncoding.EncodeToString(buffer[start:end])
	}
	return tokens
}

const tokenRandomBytes = 24
