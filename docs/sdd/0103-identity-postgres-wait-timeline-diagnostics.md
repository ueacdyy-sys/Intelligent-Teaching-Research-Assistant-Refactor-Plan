# SDD 0103: Identity PostgreSQL Wait Timeline Diagnostics

## Problem

The current 4400-concurrency Identity HTTP evidence shows the read path is
comparatively fast, while mixed read/write phases still carry high tail
latency. PgBouncer after-snapshots show `cl_waiting=0`, but gateway DB pool
stats still show material acquisition waits. Before changing pool limits again,
the benchmark needs PostgreSQL activity and wait evidence sampled during the
run, not only before and after.

## Source Requirement References

- Root requirement: the assistant runtime should stay compact, stable, and
  efficient.
- Root requirement: local secrets in performance profiles use `ueacd`.
- SDD 0100: gateway DB pool diagnostics exposed acquisition waits.
- SDD 0101: PgBouncer snapshots did not prove PgBouncer was the remaining
  queueing bottleneck.
- SDD 0102: removing JSONB timestamp mutation improved refresh rotation but
  left login/write-path and pool scheduling questions open.

## Scope

In scope:

- Add optional PostgreSQL diagnostics to the Identity HTTP benchmark runner.
- Sample `pg_stat_activity`, `pg_stat_database`, and `pg_locks` through the
  existing Docker PostgreSQL container.
- Preserve PgBouncer and gateway DB pool diagnostics.
- Keep diagnostics disabled by default so existing benchmark commands and
  quality gates keep their current cost.
- Mask local secrets and database URLs in reports and failures.

Out of scope:

- Changing PostgreSQL, PgBouncer, or gateway pool limits.
- Claiming a new concurrency ceiling without a live benchmark using the new
  diagnostics.
- Adding model, training, OCR, RAG, vector, or embedding dependencies.
- Persisting per-request SQL text or user payloads.

## Contracts

- `--postgres-diagnostics true` enables PostgreSQL diagnostics.
- Disabled diagnostics must not change the default benchmark behavior.
- Successful and failed benchmark reports may include `postgresDiagnostics`
  with `before`, `timeline`, and `after` snapshots.
- Timeline samples must be bounded by interval and max sample settings.
- Diagnostic collection must not leak the local `ueacd` secret.

## Acceptance Criteria

- Unit tests prove PostgreSQL diagnostics are disabled by default.
- Unit tests prove Docker psql diagnostics collect activity, database, and
  lock rows without leaking secrets.
- Unit tests prove the benchmark report can carry PostgreSQL diagnostics.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove `tools/identity-postgres-diagnostics.mjs`, remove the optional runner
arguments, and revert the benchmark report enrichment fields. Existing
benchmarks continue to run with only gateway and PgBouncer diagnostics.

## Observability And Performance Evidence

This slice adds instrumentation only. The next evidence-producing benchmark
should re-run the 4400 non-overlap profile with:

`--postgres-diagnostics true --postgres-diagnostics-interval-ms 1000`

The resulting report should compare PostgreSQL wait samples with gateway DB
pool acquisition deltas and PgBouncer pool snapshots before changing limits.
