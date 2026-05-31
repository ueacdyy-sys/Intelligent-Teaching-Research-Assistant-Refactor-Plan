# SDD 0096: Identity Inactive Session Maintenance

## Problem

SDD 0095 stopped new revoked sessions from accumulating in
`identity_sessions`, but the existing performance PostgreSQL volume still had
legacy inactive rows:

- `451158` total session rows
- `0` active session rows
- `451158` revoked session rows
- `539 MB` total relation size

That state can continue to distort write-path benchmarks and long-running
runtime behavior until it is explicitly pruned or reset. A repeatable
maintenance path is needed before claiming the next high-concurrency ceiling.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- SDD 0008: durable sessions must invalidate access and refresh tokens.
- SDD 0094: benchmark step profiling identified write-path variance that needs
  database evidence before tuning limits.
- SDD 0095: revoke now deletes active PostgreSQL session rows, but historical
  inactive rows still need cleanup.

## Scope

In scope:

- Add a PostgreSQL adapter maintenance operation that deletes inactive sessions:
  legacy revoked rows and active rows whose `expires_at` is at or before a
  cutoff.
- Add an explicit local maintenance CLI for the Identity session table.
- Add a package script for the PgBouncer-backed performance profile.
- Emit a machine-readable JSON maintenance report.
- Keep maintenance out of `npm test` and default runtime startup.

Out of scope:

- A background scheduler.
- Automatic destructive reset of the Docker volume.
- Changing public Identity HTTP contracts.
- Removing `revoked_at` from the table shape.
- Introducing Redis, token caches, model dependencies, OCR, RAG, vector
  databases, embeddings, or training dependencies.

## Contracts

- `PruneInactiveSessions(ctx, cutoff, limit)` deletes at most `limit` rows from
  `identity_sessions`.
- A row is inactive when:
  - it is a legacy revoked row with `revoked_at <= cutoff`, or
  - it is not revoked but `expires_at <= cutoff`.
- Limit must be positive.
- The CLI writes `before`, `after`, `prunedRows`, `cutoff`, and optional vacuum
  mode to JSON.

## Acceptance Criteria

- A focused PostgreSQL adapter test fails before implementation because no
  inactive-session prune operation exists.
- Adapter tests prove revoked and expired sessions are pruned while unexpired
  active sessions remain.
- CLI tests prove report construction and invalid limit validation.
- A live maintenance run can prune the existing performance volume.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove SDD 0096, the prune method, the maintenance CLI, the npm script, focused
tests, and live maintenance evidence. SDD 0095 still prevents new revoked rows
from accumulating.

## Observability And Performance Evidence

Record:

- Red focused adapter test before implementation.
- Focused adapter and CLI tests after implementation.
- Live maintenance report against the Identity performance PostgreSQL volume.
- A follow-up benchmark on a pruned or reset session table before updating
  high-concurrency capacity claims.
