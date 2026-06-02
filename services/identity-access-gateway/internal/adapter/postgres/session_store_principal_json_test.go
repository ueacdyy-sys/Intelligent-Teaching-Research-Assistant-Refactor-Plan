package postgres_test

import (
	"context"
	"encoding/json"
	"testing"

	"ita-refactor/services/identity-access-gateway/internal/adapter/postgres"
)

func TestSessionStoreSaveSessionOmitsColumnBackedTimestampsFromPrincipalJSON(t *testing.T) {
	db := newFakeDB()
	store := postgres.NewSessionStore(db)
	principal := teacherPrincipal("sess_1")

	if err := store.SaveSession(context.Background(), "access_1", "refresh_1", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}

	storedJSON := db.sessionsByID["sess_1"].principalJSON
	storedFields := map[string]any{}
	if err := json.Unmarshal(storedJSON, &storedFields); err != nil {
		t.Fatalf("stored principal json: %v", err)
	}
	if _, ok := storedFields["IssuedAt"]; ok {
		t.Fatalf("principal_json should not duplicate issued_at column: %s", storedJSON)
	}
	if _, ok := storedFields["ExpiresAt"]; ok {
		t.Fatalf("principal_json should not duplicate expires_at column: %s", storedJSON)
	}

	loaded, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_1")
	if err != nil || !ok {
		t.Fatalf("GetPrincipalByAccessToken loaded=%#v ok=%v err=%v", loaded, ok, err)
	}
	if !loaded.IssuedAt.Equal(principal.IssuedAt) || !loaded.ExpiresAt.Equal(principal.ExpiresAt) {
		t.Fatalf("loaded timestamps issued=%s expires=%s", loaded.IssuedAt, loaded.ExpiresAt)
	}
}
