# SDD 0166: Identity Session Expires BRIN Index

## Problem

P73 showed that `mixed1600` Identity tail latency is not improved by simply
raising worker fanout or per-worker database pool size. The controlling phase
remains `revokeCycle`, and each cycle performs a session insert followed by a
self-revoke delete.

The hot `identity_sessions` table still maintains a btree index on
`expires_at`. That index is not on the authentication hot path; it exists for
inactive-session pruning. Under high write churn, every login insert, refresh
rotation, and revoke delete still maintains that btree. A lower-write-
amplification index is a narrower hypothesis than raising pools or changing
public session semantics.

## Source Requirement References

- Immutable root requirement: identity remains a stable shared boundary for
  teacher, student, remote, and agent entry points.
- Root runtime requirement: packaging and runtime should stay compact,
  efficient, and stable.
- P73: configuration-only worker/pool changes did not beat the current
  `12 workers x pool10` mixed baseline.
- SDD 0099: redundant active token indexes were removed, but the expires index
  was intentionally kept for pruning.

## Scope

In scope:

- Replace the old `idx_identity_sessions_expires_at` btree index with a BRIN
  index on the same `expires_at` column.
- Drop the old btree index during schema ensure so existing performance volumes
  migrate.
- Keep session table columns, token uniqueness constraints, primary key,
  revoke semantics, refresh semantics, and principal lookup semantics unchanged.
- Mirror the schema contract in `contracts/sql/identity-sessions.sql`.

Out of scope:

- Removing inactive-session pruning.
- Removing token uniqueness constraints.
- Changing public Identity HTTP contracts.
- Raising PostgreSQL, PgBouncer, worker, pool, or ingress limits.
- Adding Redis, queues, model training, OCR, RAG, vectors, embeddings, or other
  heavy dependencies.
- Claiming higher full-system capacity without live benchmark evidence.

## Contracts

- `EnsureSchema` executes `DROP INDEX IF EXISTS
  idx_identity_sessions_expires_at`.
- `EnsureSchema` creates `idx_identity_sessions_expires_at_brin` using
  `USING BRIN (expires_at)`.
- `contracts/sql/identity-sessions.sql` mirrors the same migration contract.
- `PruneInactiveSessions` keeps the same SQL and return semantics.
- `SaveSession`, `RotateRefreshSession`, `RevokeSession`, and
  `RevokeOwnSession` keep their current session semantics.

## Acceptance Criteria

- A focused PostgreSQL schema test fails before implementation because the old
  btree expires index is still created.
- The focused schema test passes after the BRIN migration.
- Focused PostgreSQL adapter tests pass.
- `npm run verify:structure`, `git diff --check`, and strict quality remain
  passable.
- A follow-up mixed or Identity benchmark compares P73 baseline behavior before
  any capacity claim changes.

## Rollback

Restore the btree `idx_identity_sessions_expires_at` creation statement and
remove the BRIN index creation. P73 remains the current configuration-limit
evidence if this schema probe is rolled back.
