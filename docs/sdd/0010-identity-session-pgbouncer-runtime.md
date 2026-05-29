# SDD 0010: Identity Session PgBouncer Runtime

## Problem

The durable Identity session store has an opt-in live PostgreSQL integration test, but the current shared performance compose uses host ports already occupied by the local dev stack. That makes it unsafe to start blindly while the legacy backend and dev PostgreSQL are running.

Identity And Access needs a refactor-owned PgBouncer runtime profile with non-conflicting ports so durable session correctness can be proven against PgBouncer before multi-worker login and remote command performance tests.

## Source Requirement References

- Root requirement: teacher login, student app login, and remote/social command entry must remain stable when the system uses multiple workers.
- SDD 0009: durable Identity sessions need a live PostgreSQL evidence path.
- P0b connection budget: high-concurrency database tests should route through PgBouncer with explicit limits.

## Scope

In scope:

- Add an identity-only PostgreSQL plus PgBouncer Docker Compose profile under `infra/perf`.
- Use non-conflicting host ports `15432` for PostgreSQL and `16432` for PgBouncer.
- Keep all local test secrets set to `ueacd`.
- Add an executable audit gate for the identity runtime profile.
- Add a cross-platform Node runner that sets the PgBouncer DSN and runs the existing Go integration test.
- Document up/down/test commands.

Out of scope:

- Replacing the legacy full-system performance compose.
- Running high-concurrency benchmarks in this slice.
- Changing the identity session SQL schema.
- Starting or stopping unrelated Docker containers.

## Contracts

- `infra/perf/docker-compose.identity-session.yml`
- `infra/perf/identity-session-pgbouncer.ini`
- `infra/perf/identity-session-userlist.txt`
- `tools/identity-session-runtime-profile-audit.mjs`
- Runtime DSN: `postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable`

## Acceptance Criteria

- Runtime profile audit passes only when the identity PostgreSQL and PgBouncer services exist.
- The profile exposes PostgreSQL on `15432` and PgBouncer on `16432`.
- PostgreSQL 18 data is mounted at `/var/lib/postgresql`, not `/var/lib/postgresql/data`.
- PgBouncer uses transaction pooling.
- PostgreSQL and PgBouncer local secrets are `ueacd`.
- The integration runner targets PgBouncer by default.
- Root `npm test` passes.
- If Docker is available, the identity runtime profile can start and the live session lifecycle test passes through PgBouncer.

## Rollback

Stop only the identity runtime profile:

```powershell
npm run perf:identity-session:down
```

Unset `SESSION_DATABASE_URL` or `IDENTITY_SESSION_INTEGRATION_DATABASE_URL` to return to memory-store or skipped-test behavior.

## Observability And Performance Evidence

This slice proves the runtime path. The next slice should run a concurrent benchmark through `16432` and capture:

- PgBouncer client/server counts
- PostgreSQL active connections
- access-token lookup P95/P99
- refresh rotation P95/P99
- revoke P95/P99
- error rate under teacher/student/remote mixed traffic
