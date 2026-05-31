# SDD 0101: Identity PgBouncer Scheduling Diagnostics

## Problem

SDD 0100 proved that the corrected 4400-concurrency Identity profile has real
gateway-side DB pool waiting, but raising each gateway pool from 12 to 14 made
the mixed read/write tail worse. That negative result means the bottleneck
cannot be solved safely by increasing gateway connection fan-out alone.

The next missing layer is PgBouncer and PostgreSQL scheduling. Current evidence
records configured PgBouncer limits, but not live PgBouncer pool state during
the same benchmark window. Without that, a performance report cannot prove
whether the remaining tail comes from PgBouncer server-pool saturation,
PostgreSQL execution pressure, gateway pool acquisition, or ingress/client
transport.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- Root requirement: packaging and runtime must stay small, efficient, and
  stable for desktop operation.
- SDD 0091: high-concurrency claims require explicit gateway worker and DB
  client budget evidence.
- SDD 0100: corrected non-overlapping 4400 evidence showed gateway DB pool
  waiting and a negative pool14 result.

## Scope

In scope:

- Add an optional PgBouncer diagnostics collection path to the Identity HTTP
  benchmark runner.
- Collect PgBouncer admin snapshots before and after benchmark execution using
  the existing Docker performance stack.
- Parse `SHOW STATS`, `SHOW POOLS`, and selected `SHOW CONFIG` output into
  machine-readable report fields.
- Keep PgBouncer diagnostics disabled unless explicitly requested, so
  `npm test` stays Docker-free.
- Mask local secrets and DSNs in success and failure reports.
- Register the corrected 4400 pool12 run with PgBouncer diagnostics as evidence
  if the live probe succeeds.

Out of scope:

- Changing public Identity HTTP contracts.
- Changing token or session semantics.
- Raising PostgreSQL or PgBouncer limits.
- Raising gateway DB pool limits.
- Introducing Redis, model dependencies, OCR, RAG, vector databases,
  embeddings, or training dependencies.

## Contracts

- `--pgbouncer-diagnostics true` enables PgBouncer snapshot collection.
- `--pgbouncer-diagnostics false` remains the default.
- PgBouncer diagnostics use local Docker performance services:
  - PgBouncer container reachable from the Postgres container as
    `identity-session-pgbouncer:6432`
  - Postgres container `ita-identity-session-postgres` provides `psql`
  - Admin user `app_user`
  - Local password `ueacd`
- Reports may include `pgbouncerDiagnostics.before` and
  `pgbouncerDiagnostics.after`.
- Each snapshot records:
  - `status`
  - `sampledAt`
  - `queries.stats.rows`
  - `queries.pools.rows`
  - `queries.config.rows`
- Parsed rows must be arrays of objects keyed by column names.
- Failure to collect PgBouncer diagnostics must be recorded as a diagnostics
  error without leaking `ueacd` or a PostgreSQL DSN.
- When enabled, success and failure reports must attach whatever diagnostics
  were collected before cleanup.

## Acceptance Criteria

- A focused runner test fails before PgBouncer diagnostics options and report
  attachment exist.
- A focused parser test fails before `psql` unaligned output can be parsed into
  objects.
- The focused runner tests pass after implementation without requiring Docker.
- A Dockerized 4400 non-overlap pool12 probe with PgBouncer diagnostics passes
  with zero phase errors.
- The new evidence report is registered and `npm run audit:performance-evidence`
  returns READY.
- `npm test` passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove this SDD, the PgBouncer diagnostics runner path, focused tests, new live
evidence, and registry entries. SDD 0100 remains the corrected 4400 gateway
pool diagnostics evidence.

## Observability And Performance Evidence

Record:

- Red focused runner tests before implementation.
- Green focused runner tests after implementation.
- A Dockerized 4400 pool12 non-overlap benchmark with
  `--pgbouncer-diagnostics true`.
- PgBouncer snapshots showing live stats, pool state, and relevant config.
- Performance evidence registry audit result.
- `npm test` and `npm run quality` results.
