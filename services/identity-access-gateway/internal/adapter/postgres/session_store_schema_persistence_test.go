package postgres_test

import (
	"context"
	"strings"
	"testing"

	"ita-refactor/services/identity-access-gateway/internal/adapter/postgres"
)

func TestEnsureSchemaCanUseUnloggedSessionTable(t *testing.T) {
	db := newFakeDB()

	err := postgres.EnsureSchemaWithConfig(context.Background(), db, postgres.SchemaConfig{
		SessionTablePersistence: postgres.SessionTablePersistenceUnlogged,
	})
	if err != nil {
		t.Fatalf("EnsureSchemaWithConfig error = %v", err)
	}

	schemaSQL := strings.Join(db.execSQL, "\n")
	if !strings.Contains(schemaSQL, "CREATE UNLOGGED TABLE IF NOT EXISTS identity_sessions") {
		t.Fatal("schema should create identity_sessions as unlogged in the unlogged profile")
	}
	if !strings.Contains(schemaSQL, "ALTER TABLE identity_sessions SET UNLOGGED") {
		t.Fatal("schema should convert an existing identity_sessions table to unlogged")
	}
	if strings.Contains(schemaSQL, "CREATE UNLOGGED TABLE IF NOT EXISTS identity_remote_command_nonces") {
		t.Fatal("remote command nonce table must remain logged for replay protection")
	}
}

func TestEnsureSchemaLoggedProfileCanRestoreSessionTable(t *testing.T) {
	db := newFakeDB()

	err := postgres.EnsureSchemaWithConfig(context.Background(), db, postgres.SchemaConfig{
		SessionTablePersistence: postgres.SessionTablePersistenceLogged,
	})
	if err != nil {
		t.Fatalf("EnsureSchemaWithConfig error = %v", err)
	}

	schemaSQL := strings.Join(db.execSQL, "\n")
	if !strings.Contains(schemaSQL, "CREATE TABLE IF NOT EXISTS identity_sessions") {
		t.Fatal("logged profile should create a logged identity_sessions table")
	}
	if strings.Contains(schemaSQL, "CREATE UNLOGGED TABLE IF NOT EXISTS identity_sessions") {
		t.Fatal("logged profile should not create identity_sessions as unlogged")
	}
	if !strings.Contains(schemaSQL, "ALTER TABLE identity_sessions SET LOGGED") {
		t.Fatal("logged profile should convert an existing identity_sessions table back to logged")
	}
}
