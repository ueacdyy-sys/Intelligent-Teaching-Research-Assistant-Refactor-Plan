package domain

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

var ErrInvalidTitle = errors.New("conversation title must be between 1 and 200 characters")

type Settings map[string]any

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

func NormalizeTitle(title string) (string, error) {
	normalized := strings.TrimSpace(title)
	if normalized == "" || utf8.RuneCountInString(normalized) > 200 {
		return "", ErrInvalidTitle
	}
	return normalized, nil
}
