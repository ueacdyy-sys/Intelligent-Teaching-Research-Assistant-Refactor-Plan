# SDD 0102: Identity Session Column-Backed Timestamps

## Problem

The current Identity session store keeps `issued_at` and `expires_at` mirrored
inside `principal_json` and also in dedicated columns. That made the fast
refresh path perform a JSON mutation in PostgreSQL just to keep time fields in
sync, even though the store already has authoritative scalar columns for those
values.

High-concurrency evidence shows the mixed write paths still carry a large tail.
The next safe optimization is to make the scalar timestamp columns the
authoritative read source and stop rewriting `principal_json` on token
rotation.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- Root requirement: the runtime should stay compact, stable, and efficient.
- SDD 0013: self-revoke and fast refresh behavior stay inside the identity
  use case boundary.
- SDD 0101: PgBouncer snapshots showed no queueing, while gateway DB pool waits
  and write-path tail latency remained material.

## Scope

In scope:

- Make `issued_at` and `expires_at` columns authoritative for session reads.
- Stop mutating `principal_json` on refresh rotation and fallback session
  rotation.
- Keep the public HTTP contract unchanged.
- Keep the existing session schema shape unchanged.
- Preserve correctness for access lookup, refresh lookup, revoke, and prune.

Out of scope:

- Removing `principal_json` from the table.
- Changing public session response shapes.
- Introducing caches, model dependencies, OCR, RAG, embeddings, or training.
- Raising PgBouncer or PostgreSQL limits.

## Contracts

- `GetPrincipalByAccessToken` and `GetPrincipalByRefreshToken` must return the
  principal with timestamps reconstructed from columns.
- `RotateRefreshSession` must still return the updated principal.
- `RotateSession` must still invalidate old tokens and keep session timestamps
  correct for subsequent reads while rejecting expired refresh tokens
  atomically.
- The SQL schema remains `identity_sessions`; no table rewrite is required.

## Acceptance Criteria

- Focused adapter tests prove reads keep the correct timestamps after
  refresh/rotate updates.
- Integration tests prove the PostgreSQL adapter still returns correct
  timestamps after refresh rotation.
- `npm test` passes.
- `npm run quality` passes.
- A repeat 4400 non-overlap benchmark is re-run after the change and compared
  with the previous PgBouncer-diagnostic run.

## Rollback

Restore the previous JSONB timestamp mutation on refresh/rotate and remove the
column-backed read merge.

## Observability And Performance Evidence

Record:

- Focused red/green adapter tests for column-backed timestamps.
- Integration test coverage for refresh rotation and timestamp reads.
- Before/after 4400 HTTP benchmark tail latency, especially refresh rotation
  and revoke cycle.
- Cleanup confirmation for benchmark containers and build artifacts.
