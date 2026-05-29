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

func randomToken() string {
	buffer := make([]byte, 24)
	if _, err := rand.Read(buffer); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(buffer)
}
