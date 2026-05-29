package legacyauth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"ita-refactor/services/identity-access-gateway/internal/domain"
)

const passwordLoginPath = "/api/v1/auth/login/password"

type Authenticator struct {
	baseURL string
	client  *http.Client
}

func NewAuthenticator(baseURL string, client *http.Client) *Authenticator {
	if client == nil {
		client = http.DefaultClient
	}
	return &Authenticator{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  client,
	}
}

func (a *Authenticator) AuthenticatePassword(
	ctx context.Context,
	input domain.PasswordSessionInput,
) (domain.Account, error) {
	payload := legacyPasswordLoginRequest{
		Identifier: input.Identifier,
		Password:   input.Password,
		Role:       toLegacyRole(input.RequestedRole),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return domain.Account{}, err
	}
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		a.baseURL+passwordLoginPath,
		bytes.NewReader(body),
	)
	if err != nil {
		return domain.Account{}, err
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := a.client.Do(request)
	if err != nil {
		return domain.Account{}, err
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusNotFound {
		return domain.Account{}, domain.ErrInvalidCredentials
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return domain.Account{}, fmt.Errorf("legacy auth returned status %d", response.StatusCode)
	}

	var decoded legacyTokenPairResponse
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		return domain.Account{}, err
	}
	account, err := decoded.toAccount()
	if err != nil {
		return domain.Account{}, err
	}
	if input.RequestedRole != "" && account.Role != input.RequestedRole {
		return domain.Account{}, domain.ErrForbidden
	}
	return account, nil
}

type legacyPasswordLoginRequest struct {
	Identifier string `json:"identifier"`
	Password   string `json:"password"`
	Role       string `json:"role,omitempty"`
}

type legacyTokenPairResponse struct {
	User legacyUser `json:"user"`
}

type legacyUser struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
	IsActive    bool   `json:"isActive"`
}

func (r legacyTokenPairResponse) toAccount() (domain.Account, error) {
	id := strings.TrimSpace(r.User.ID)
	if id == "" {
		return domain.Account{}, errors.New("legacy auth response missing user.id")
	}
	role, err := fromLegacyRole(r.User.Role)
	if err != nil {
		return domain.Account{}, err
	}
	if !r.User.IsActive {
		return domain.Account{}, domain.ErrInvalidCredentials
	}
	return domain.Account{
		ID:          id,
		Role:        role,
		DisplayName: r.User.DisplayName,
	}, nil
}

func toLegacyRole(role domain.Role) string {
	switch role {
	case domain.RoleTeacher:
		return "teacher"
	case domain.RoleStudent:
		return "student"
	case domain.RoleAdmin:
		return "admin"
	default:
		return ""
	}
}

func fromLegacyRole(role string) (domain.Role, error) {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "teacher":
		return domain.RoleTeacher, nil
	case "student":
		return domain.RoleStudent, nil
	case "admin":
		return domain.RoleAdmin, nil
	default:
		return "", fmt.Errorf("unsupported legacy user role %q", role)
	}
}
