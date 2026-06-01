package platform

import (
	"crypto/rand"
	"encoding/base64"
	"time"
)

type Clock struct{}

func (Clock) Now() time.Time {
	return time.Now().UTC()
}

type TokenIssuer struct{}

func (TokenIssuer) NewSessionID() string {
	return "sess_" + randomToken()
}

func (TokenIssuer) NewAccessToken() string {
	return "access_" + randomToken()
}

func (TokenIssuer) NewRefreshToken() string {
	return "refresh_" + randomToken()
}

func (TokenIssuer) NewGrantToken() string {
	return "grant_" + randomToken()
}

func (TokenIssuer) NewUserSessionTokens() (string, string, string) {
	tokens := randomTokens(3)
	return "sess_" + tokens[0], "access_" + tokens[1], "refresh_" + tokens[2]
}

func (TokenIssuer) NewAccessRefreshTokens() (string, string) {
	tokens := randomTokens(2)
	return "access_" + tokens[0], "refresh_" + tokens[1]
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
