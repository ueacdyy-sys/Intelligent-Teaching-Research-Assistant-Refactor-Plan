package domain

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

var ErrInvalidTitle = errors.New("conversation title must be between 1 and 200 characters")

type Settings []byte

type Conversation struct {
	ID           string
	Title        string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	MessageCount int
	TotalTokens  int
	Settings     Settings
}

type CreateConversationInput struct {
	Title    string
	Settings Settings
}

func NewSettingsJSON(raw []byte) Settings {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return nil
	}
	settings := make([]byte, len(trimmed))
	copy(settings, trimmed)
	return Settings(settings)
}

func (s Settings) JSON() json.RawMessage {
	if len(s) == 0 {
		return nil
	}
	return json.RawMessage(s)
}

func (s Settings) JSONString() string {
	if len(s) == 0 {
		return ""
	}
	return string(s)
}

func NormalizeTitle(title string) (string, error) {
	normalized := strings.TrimSpace(title)
	if normalized == "" || utf8.RuneCountInString(normalized) > 200 {
		return "", ErrInvalidTitle
	}
	return normalized, nil
}
