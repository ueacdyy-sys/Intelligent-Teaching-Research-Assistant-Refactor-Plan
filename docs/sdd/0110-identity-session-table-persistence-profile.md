# SDD 0110: Identity Session Table Persistence Profile

## Problem

SDD 0109 attributes the shaped-write queue to session creation and self-revoke
operations. Those operations mutate `identity_sessions`, which stores ephemeral
access and refresh token state. The same PostgreSQL adapter also stores remote
command replay nonces, but those nonces are not ephemeral in the same way:
losing them after a crash would weaken replay protection.

The system needs a controlled performance profile that can reduce WAL pressure
for session churn without changing remote command durability or public Identity
HTTP contracts.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- Root requirement: packaging and runtime must stay compact, stable, and
  efficient.
- Root requirement: local performance secrets use `ueacd`.
- SDD 0109: operation-level diagnostics show session save/revoke writes dominate
  shaped-write queue time.

## Scope

In scope:

- Add an explicit session-table persistence profile:
  `SESSION_DB_SESSION_TABLE_PERSISTENCE=logged|unlogged`.
- Keep `logged` as the default.
- Allow `unlogged` only for `identity_sessions`.
- Keep `identity_remote_command_nonces` logged and durable.
- Make `EnsureSchema` able to convert the session table between logged and
  unlogged modes.

Out of scope:

- Changing public Identity HTTP contracts.
- Changing token format, principal context, login, refresh, logout, or remote
  command semantics.
- Making remote command replay nonces unlogged.
- Adding Redis, caches, queues, model dependencies, OCR, RAG, vectors,
  embeddings, or training dependencies.

## Contracts Touched

- Runtime config may set `SESSION_DB_SESSION_TABLE_PERSISTENCE=unlogged`.
- If the session table is unlogged and PostgreSQL crashes, active sessions may
  be lost and users must log in again.
- Remote command replay nonces remain in a logged table.
- Unset or `logged` config preserves the existing durable session-table
  behavior.

## Acceptance Criteria

- Focused schema tests fail before implementation because
  `EnsureSchemaWithConfig` and unlogged session-table DDL do not exist.
- Focused schema tests pass after implementation.
- Gateway startup reads and validates the persistence profile.
- `npm run quality` passes.
- A follow-up Docker 4400 probe can compare logged versus unlogged
  session-table performance.

## Rollback Plan

Unset `SESSION_DB_SESSION_TABLE_PERSISTENCE` or set it to `logged`. The schema
ensurer converts `identity_sessions` back to a logged table while leaving remote
command nonce durability unchanged.

## Observability And Performance Evidence

Record:

- Red/green focused schema tests.
- Green strict quality gate output.
- A follow-up 4400 Docker report using `SESSION_DB_SESSION_TABLE_PERSISTENCE`
  set to `unlogged`.
