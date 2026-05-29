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

type IDGenerator struct{}

func (IDGenerator) NewID() string {
	buffer := make([]byte, 18)
	if _, err := rand.Read(buffer); err != nil {
		panic(err)
	}
	return "tarch_" + base64.RawURLEncoding.EncodeToString(buffer)
}

type TutoringRequestIDGenerator struct{}

func (TutoringRequestIDGenerator) NewID() string {
	buffer := make([]byte, 18)
	if _, err := rand.Read(buffer); err != nil {
		panic(err)
	}
	return "tutor_req_" + base64.RawURLEncoding.EncodeToString(buffer)
}
