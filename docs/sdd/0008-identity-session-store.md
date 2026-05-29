# SDD 0008: Identity Session Store

## Problem

The Identity Access Gateway now supports password sessions, refresh rotation, revoke, principal lookup, remote command grants, and a legacy auth adapter. However, its session lifecycle still uses an in-memory store by default. That is acceptable for refactor smoke tests, but not for a whole-system migration because sessions disappear on process restart and cannot be shared across workers.

The refactor needs a durable PostgreSQL session store behind the existing `SessionStore` port without coupling identity use cases to PostgreSQL.

## Source Requirement References

- Root requirement: teacher login, student login, and remote/social command entry must be stable enough for desktop and mobile use.
- SDD 0006: Identity And Access boundary.
- SDD 0007: Identity Access Gateway behavior and rollback.
- P0b connection budget: every new database-using service must be included in the global connection budget.

## Scope

In scope:

- Define the `identity_sessions` SQL contract.
- Implement a PostgreSQL `SessionStore` adapter for the existing Go gateway.
- Keep the in-memory store as the default rollback path.
- Add runtime configuration to use PostgreSQL only when `SESSION_DATABASE_URL` is set.
- Include the identity gateway database pool in proposed connection budgets.

Out of scope:

- Migrating legacy FastAPI auth storage.
- Implementing WeChat callback persistence.
- Encrypting session payloads at rest.
- Running a live PostgreSQL integration test in this slice.

## Contracts

- `contracts/sql/identity-sessions.sql`
- `services/identity-access-gateway/internal/usecase.SessionStore`

## Acceptance Criteria

- PostgreSQL adapter saves a principal context by access token, refresh token, and session ID.
- Access-token lookup ignores revoked sessions.
- Refresh-token lookup ignores revoked sessions.
- Refresh rotation replaces old access and refresh tokens atomically for the session.
- Revoke marks the session revoked so old tokens stop resolving.
- Main composition root uses PostgreSQL session store when `SESSION_DATABASE_URL` is set, otherwise memory store.
- Connection budget profiles include the identity gateway pool.
- Root `npm test` passes.

## Rollback

Unset `SESSION_DATABASE_URL` and the gateway uses the in-memory store. Existing legacy FastAPI auth remains the product rollback route until the new gateway is routed by clients.

## Observability And Performance Evidence

Future runtime tests should record:

- identity session DB pool size
- token lookup P95/P99 latency
- refresh rotation P95/P99 latency
- revoked-token lookup count
- session table row count and index hit ratio
