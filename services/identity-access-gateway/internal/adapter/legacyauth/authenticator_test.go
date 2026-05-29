package legacyauth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"ita-refactor/services/identity-access-gateway/internal/adapter/legacyauth"
	"ita-refactor/services/identity-access-gateway/internal/domain"
)

func TestAuthenticatorMapsLegacyPasswordLoginToAccount(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/auth/login/password" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s", r.Method)
		}
		var request map[string]any
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatalf("request JSON: %v", err)
		}
		if request["identifier"] != "teacher@example.com" {
			t.Fatalf("identifier = %v", request["identifier"])
		}
		if request["password"] != "ueacd" {
			t.Fatalf("password = %v", request["password"])
		}
		if request["role"] != "teacher" {
			t.Fatalf("role = %v", request["role"])
		}
		writeJSON(t, w, http.StatusOK, map[string]any{
			"accessToken":  "legacy_access",
			"refreshToken": "legacy_refresh",
			"tokenType":    "Bearer",
			"expiresIn":    3600,
			"message":      "Password login successful",
			"user": map[string]any{
				"id":          "user_teacher_1",
				"displayName": "Teacher One",
				"role":        "teacher",
				"isActive":    true,
				"createdAt":   "2026-05-28T08:00:00Z",
				"updatedAt":   "2026-05-28T08:00:00Z",
			},
		})
	}))
	defer server.Close()

	authenticator := legacyauth.NewAuthenticator(server.URL, server.Client())
	account, err := authenticator.AuthenticatePassword(context.Background(), domain.PasswordSessionInput{
		Identifier:    "teacher@example.com",
		Password:      "ueacd",
		RequestedRole: domain.RoleTeacher,
	})
	if err != nil {
		t.Fatalf("AuthenticatePassword error = %v", err)
	}

	if account.ID != "user_teacher_1" {
		t.Fatalf("id = %s", account.ID)
	}
	if account.Role != domain.RoleTeacher {
		t.Fatalf("role = %s", account.Role)
	}
	if account.DisplayName != "Teacher One" {
		t.Fatalf("displayName = %s", account.DisplayName)
	}
}

func TestAuthenticatorMapsLegacyUnauthorizedToInvalidCredentials(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, http.StatusUnauthorized, map[string]any{"detail": "bad credentials"})
	}))
	defer server.Close()

	authenticator := legacyauth.NewAuthenticator(server.URL, server.Client())
	_, err := authenticator.AuthenticatePassword(context.Background(), domain.PasswordSessionInput{
		Identifier: "student001",
		Password:   "bad",
	})

	if err != domain.ErrInvalidCredentials {
		t.Fatalf("err = %v", err)
	}
}

func TestAuthenticatorRejectsMismatchedRequestedRole(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, http.StatusOK, map[string]any{
			"accessToken":  "legacy_access",
			"refreshToken": "legacy_refresh",
			"tokenType":    "Bearer",
			"expiresIn":    3600,
			"message":      "Password login successful",
			"user": map[string]any{
				"id":          "user_teacher_1",
				"displayName": "Teacher One",
				"role":        "teacher",
				"isActive":    true,
				"createdAt":   "2026-05-28T08:00:00Z",
				"updatedAt":   "2026-05-28T08:00:00Z",
			},
		})
	}))
	defer server.Close()

	authenticator := legacyauth.NewAuthenticator(server.URL, server.Client())
	_, err := authenticator.AuthenticatePassword(context.Background(), domain.PasswordSessionInput{
		Identifier:    "student001",
		Password:      "ueacd",
		RequestedRole: domain.RoleStudent,
	})

	if err != domain.ErrForbidden {
		t.Fatalf("err = %v", err)
	}
}

func TestAuthenticatorRejectsMalformedLegacyResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, http.StatusOK, map[string]any{"user": map[string]any{"role": "teacher"}})
	}))
	defer server.Close()

	authenticator := legacyauth.NewAuthenticator(server.URL, server.Client())
	_, err := authenticator.AuthenticatePassword(context.Background(), domain.PasswordSessionInput{
		Identifier: "teacher@example.com",
		Password:   "ueacd",
	})

	if err == nil {
		t.Fatal("expected malformed response error")
	}
}

func writeJSON(t *testing.T, w http.ResponseWriter, status int, payload any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		t.Fatalf("write JSON: %v", err)
	}
}
