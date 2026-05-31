# SDD 0095: Identity Session Revoke Delete

## Problem

The SDD 0094 Dockerized profile showed a separate `refreshRotation` tail
latency spike. A follow-up database inspection of the Identity performance
PostgreSQL volume found:

- `identity_sessions.total_sessions = 451158`
- `identity_sessions.active_sessions = 0`
- `identity_sessions.revoked_sessions = 451158`
- `identity_sessions` total relation size was `539 MB`
- global token unique indexes were tens of MB even though no active sessions
  remained

The current revoke path marks sessions with `revoked_at` but leaves the row and
both token values in the main session table. Under repeated high-concurrency
benchmarks, and in a long-running product runtime, write paths keep maintaining
large token indexes for sessions that can never authenticate again.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- SDD 0008: durable sessions must invalidate access and refresh tokens.
- SDD 0013: self-revoke fast path optimized authorization to one conditional
  write, but explicitly left physical compaction out of that early slice.
- SDD 0094: revoke-cycle step profile showed the next bottleneck investigation
  should avoid blind limit changes and inspect write-path root causes.

## Scope

In scope:

- Change PostgreSQL revoke writes from "mark revoked" to deleting matching
  active session rows.
- Preserve public HTTP revoke semantics.
- Preserve access-token and refresh-token invalidation semantics: a revoked
  token must not load a principal.
- Keep legacy rows with `revoked_at IS NOT NULL` invalid under existing read
  filters.
- Keep the table shape backward-compatible so existing persisted volumes can
  still be read and cleaned up later.

Out of scope:

- Removing `revoked_at` from the SQL contract.
- Adding Redis, token caches, model dependencies, OCR, RAG, vector databases,
  embeddings, or training dependencies.
- Bulk admin session management.
- A full retention scheduler or VACUUM/REINDEX automation.

## Contracts

- `RevokeSession(ctx, sessionID)` removes the matching active row from
  `identity_sessions`.
- `RevokeOwnSession(ctx, accessToken, sessionID, now)` removes the matching
  active, unexpired row when both session and access token match.
- Legacy revoked rows remain invalid because principal lookups continue to
  require `revoked_at IS NULL`.
- `DELETE /v1/identity/sessions/{sessionId}` remains the public API.

## Acceptance Criteria

- A focused PostgreSQL adapter test fails before implementation because revoke
  SQL still uses `SET revoked_at`.
- PostgreSQL adapter tests prove generic revoke deletes the active session row.
- PostgreSQL adapter tests prove self-revoke deletes only when session ID,
  access token, active state, and expiry conditions match.
- Existing token invalidation tests remain green.
- `npm test` passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Restore the previous `UPDATE identity_sessions SET revoked_at = NOW()` revoke
queries and the corresponding adapter tests. SDD 0094 evidence remains useful
for diagnosing the mixed revoke-cycle workload.

## Observability And Performance Evidence

Record:

- The database inspection that found 451158 revoked rows and no active rows in
  the performance volume.
- Red focused adapter test before implementation.
- Focused adapter tests after implementation.
- Full quality-gate result.
- A later live benchmark should compare session table row growth before and
  after this slice.
