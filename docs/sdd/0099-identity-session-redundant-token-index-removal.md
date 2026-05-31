# SDD 0099: Identity Session Redundant Token Index Removal

## Problem

The clean-table 4400 client-200 probe in SDD 0098 showed that client transport
capacity improved `revokeCycle` P99, but did not solve the write-path tail.
`revokeCycle` still spends more than 3 seconds at P95 because every logical
operation performs login, self-revoke, and revoked-principal verification.

After SDD 0095 changed revocation from "mark revoked" to physical row deletion,
the hot Identity session table still maintains both:

- unique token indexes created by `access_token TEXT NOT NULL UNIQUE` and
  `refresh_token TEXT UNIQUE`
- partial active-token indexes on the same token columns with
  `revoked_at IS NULL`

The partial indexes were useful when revoked rows remained in the table. They
are now redundant on the clean-table hot path because principal lookups can use
the unique token indexes and then apply the existing `revoked_at IS NULL`
predicate for backward-compatible legacy rows. Keeping the duplicate indexes
adds write amplification to login, refresh rotation, and revoke/delete.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- Root requirement: packaging and runtime must stay small, efficient, and
  stable for desktop operation.
- SDD 0095: revoked active sessions are physically deleted instead of retained
  in the primary session table.
- SDD 0098: client transport tuning did not remove the mixed write-path
  latency tail, so the next slice must inspect real hot-path work.

## Scope

In scope:

- Stop creating `idx_identity_sessions_access_active`.
- Stop creating `idx_identity_sessions_refresh_active`.
- Drop both indexes during `EnsureSchema` so older local performance volumes
  do not retain write amplification.
- Keep `access_token` and `refresh_token` uniqueness constraints.
- Keep `revoked_at IS NULL` filters in reads for backward-compatible legacy
  revoked rows.

Out of scope:

- Removing `revoked_at` from the SQL contract.
- Changing public Identity HTTP contracts.
- Changing token or session semantics.
- Raising PostgreSQL or PgBouncer limits.
- Introducing Redis, model dependencies, OCR, RAG, vector databases,
  embeddings, or training dependencies.

## Contracts

- `EnsureSchema` must execute `DROP INDEX IF EXISTS
  idx_identity_sessions_access_active`.
- `EnsureSchema` must execute `DROP INDEX IF EXISTS
  idx_identity_sessions_refresh_active`.
- `EnsureSchema` must not recreate either redundant partial token index.
- `identity_sessions.access_token` remains unique.
- `identity_sessions.refresh_token` remains unique.
- Principal lookups still reject legacy revoked rows with `revoked_at IS NULL`.

## Acceptance Criteria

- A focused schema test fails before implementation because `EnsureSchema`
  still creates the redundant partial indexes and does not drop them.
- The focused schema test passes after implementation.
- Existing PostgreSQL adapter session lifecycle tests remain green.
- `npm test` passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Restore the two partial token index creation statements and remove the drop
statements. SDD 0098 remains the current transport-profile evidence if the
schema optimization is rolled back.

## Observability And Performance Evidence

Record:

- The red focused schema test.
- The green focused PostgreSQL adapter test run.
- A follow-up Dockerized 4400 client-200 probe when the local performance stack
  has been migrated with the index drops.
- `npm test` and `npm run quality`.
