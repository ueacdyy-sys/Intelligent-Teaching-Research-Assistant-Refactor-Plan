# SDD 0009: Identity Session Runtime Evidence

## Problem

SDD 0008 added a durable PostgreSQL session adapter for Identity And Access, but its proof is still a fake-DB adapter test plus root unit gates. That protects usecase behavior, but it does not prove the adapter works against a real PostgreSQL/PgBouncer endpoint, which is required before judging multi-worker login and remote command performance.

The refactor needs an explicit runtime evidence path for durable identity sessions without making ordinary root tests depend on Docker or an external database.

## Source Requirement References

- Root requirement: teacher login, student app login, and remote/social command entry are shared entry points for the whole system.
- SDD 0008: Identity sessions need durable PostgreSQL persistence when multiple workers or process restarts are in scope.
- P0b connection budget: database-using services must keep explicit pool limits before high-concurrency tests.

## Scope

In scope:

- Add an opt-in PostgreSQL integration test for the Identity session store.
- Keep root `npm test` runnable without Docker by skipping the integration test when no integration DSN is provided.
- Reuse one adapter-level pgxpool wrapper from both `cmd/gateway` and integration tests.
- Add a package script for live durable-session verification.
- Document the runtime evidence command and expected PgBouncer DSN.

Out of scope:

- Starting Docker automatically.
- Running a full high-concurrency benchmark.
- Implementing WeChat provider callbacks.
- Changing the session SQL contract.

## Contracts

- `services/identity-access-gateway/internal/adapter/postgres.SessionStore`
- `contracts/sql/identity-sessions.sql`
- Runtime env: `IDENTITY_SESSION_INTEGRATION_DATABASE_URL`

## Acceptance Criteria

- The integration test opens a real pgxpool only when `IDENTITY_SESSION_INTEGRATION_DATABASE_URL` is set.
- The integration test ensures schema, saves a teacher principal, loads it by access token, rotates refresh/access tokens, proves old tokens are invalid, revokes the session, and proves revoked tokens stop resolving.
- The gateway composition root reuses the same pgxpool adapter wrapper as the integration test.
- A root package script exposes the opt-in integration check.
- Root `npm test` still passes without Docker or PostgreSQL.

## Rollback

If live PostgreSQL testing is unavailable, unset `IDENTITY_SESSION_INTEGRATION_DATABASE_URL`; the test is skipped and the fake-DB adapter test remains the local correctness gate. Production rollback is still to unset `SESSION_DATABASE_URL` and use the in-memory store.

## Observability And Performance Evidence

This slice records correctness evidence only. The next performance slice should run the same durable session path through PgBouncer and capture:

- pool max connections
- access lookup P95/P99
- refresh rotation P95/P99
- revoke P95/P99
- PgBouncer client/server counts
- PostgreSQL index hit ratio for `identity_sessions`
