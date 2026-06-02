# SDD 0168: Identity Principal JSON Column Timestamp Elision

## Problem

SDD 0102 made `identity_sessions.issued_at` and
`identity_sessions.expires_at` the authoritative timestamp sources for session
reads. `SaveSession` still serializes those same timestamps into
`principal_json`, then stores them again in the scalar columns.

P75 surfaced `saveSession` as one of the slow Identity session operations in
the mixed workload. The duplicated timestamp fields are not the whole
bottleneck, but they are avoidable JSON encoding and JSONB write payload on
every password, WeChat, revoke-cycle login, and remote grant session insert.

## Scope

In scope:

- Encode persisted `principal_json` without `IssuedAt` and `ExpiresAt`.
- Keep `issued_at` and `expires_at` columns authoritative for all session
  reads.
- Preserve access-token and refresh-token lookup behavior.
- Preserve public Identity HTTP response shapes after a principal is loaded.
- Keep existing table columns, indexes, worker counts, pool limits, PgBouncer
  settings, and benchmark workload shape unchanged.

Out of scope:

- Removing `principal_json`.
- Changing the `identity_sessions` table schema.
- Changing token generation, token uniqueness, refresh rotation, revoke
  semantics, or session expiration behavior.
- Introducing caches, model dependencies, OCR, RAG, vector stores, embeddings,
  or training dependencies.
- Claiming a new capacity limit or root SLO promotion.

## Contracts

- New session inserts still write `principal_json`.
- The stored `principal_json` must not include `IssuedAt` or `ExpiresAt`.
- `GetPrincipalByAccessToken`, `GetPrincipalByRefreshToken`, and
  `RotateRefreshSession` must return principals with timestamps reconstructed
  from `issued_at` and `expires_at`.
- Existing rows whose `principal_json` still contains timestamp fields remain
  readable because decode accepts the older JSON shape and column values remain
  authoritative.

## Acceptance Criteria

- A focused PostgreSQL adapter test fails before implementation because
  `principal_json` still contains `IssuedAt` and `ExpiresAt`.
- The same test passes after implementation and proves loaded principals still
  return the correct timestamps.
- Focused Identity PostgreSQL adapter tests pass.
- `go test ./services/identity-access-gateway/... -count=1` passes.
- `npm run verify:structure`, `npm run quality`, and `git diff --check` pass.
- A short Identity HTTP smoke benchmark parses successfully and shows zero
  phase errors before any capacity claim changes.

## Rollback

Restore `encodePrincipal` to marshal `domain.PrincipalContext` directly. The
column-backed read path from SDD 0102 remains valid either way.
