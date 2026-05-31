# SDD 0107: Identity Write Limiter Telemetry

## Problem

SDD 0106 showed that `SESSION_DB_WRITE_CONCURRENCY` can collapse gateway DB
pool acquisition waits, but it does not improve mixed workload throughput by
default. The evidence strongly suggests that wait time moved from pgx pool
acquisition into the application write-limiter queue.

That queue is currently invisible. Without first-class limiter telemetry, the
next optimization would be guesswork: benchmark reports can show lower DB pool
waits and worse total duration, but they cannot quantify how much time was
spent waiting for a write slot.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- Root requirement: packaging and runtime must stay compact, stable, and
  efficient.
- Root requirement: local performance secrets use `ueacd`.
- SDD 0106: shaped write probes must remain opt-in; future work should add
  write-limiter wait metrics before promotion.

## Scope

In scope:

- Expose write-limiter status in the existing internal session DB diagnostics
  response.
- Record whether the limiter is enabled, the configured limit, slots in use,
  current waiters, successful acquisitions, canceled acquisitions, and
  cumulative wait duration.
- Keep the existing `/internal/identity/session-db-pool` route, auth header,
  and response contract backwards-compatible.
- Keep `SESSION_DB_WRITE_CONCURRENCY=0` as the default.

Out of scope:

- Changing public Identity HTTP contracts.
- Changing token or session semantics.
- Enabling the write limiter by default.
- Running another 4400 Docker benchmark before telemetry exists in reports.
- Adding caches, queues, model dependencies, OCR, RAG, vectors, embeddings, or
  training dependencies.

## Contracts Touched

- `platform.SessionDBPoolStats` includes nested `writeLimiter` telemetry.
- Disabled limiter reports `enabled=false` and zero counters.
- Enabled limiter reports the configured limit and current slot usage.
- Waiting writers are visible while blocked on the limiter.
- Internal diagnostics must not leak `ueacd`.

## Acceptance Criteria

- A focused adapter test fails before implementation because
  `SessionWriteLimiterStats` and `SessionStore.SessionWriteLimiterStats` do not
  exist.
- A focused HTTP diagnostics test fails before implementation because
  `SessionDBPoolStats.writeLimiter` does not exist.
- Focused tests pass after implementation.
- `go test ./services/identity-access-gateway/internal/adapter/postgres -count=1`
  passes.
- `go test ./services/identity-access-gateway/internal/adapter/httpapi -count=1`
  passes.
- `go test ./services/identity-access-gateway/... -count=1` passes.
- `npm run quality` passes.

## Rollback Plan

Remove `SessionWriteLimiterStats`, remove the limiter counters from
`SessionStore`, and restore the diagnostics stats shape to the SDD 0106 state.
Keep `SESSION_DB_WRITE_CONCURRENCY` defaulted to disabled.

## Observability And Performance Evidence

Record:

- Red/green adapter and HTTP diagnostics tests.
- Green Identity gateway Go tests.
- Strict quality gate output.
- Follow-up Docker benchmark evidence only after the telemetry appears in
  gateway diagnostics reports.
