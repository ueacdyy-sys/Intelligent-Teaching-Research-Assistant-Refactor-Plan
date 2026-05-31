# SDD 0108: Identity Write Limiter Benchmark Summary

## Problem

SDD 0107 exposes the optional Identity PostgreSQL write limiter through the
internal gateway diagnostics endpoint. The next 4400-concurrency probes can now
collect raw limiter counters, but the benchmark report still forces reviewers to
inspect every gateway snapshot manually.

That is too weak for performance work. The system needs a first-class aggregate
summary so shaped write probes can show whether pgx pool wait was reduced or
merely moved into application write-slot waiting.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- Root requirement: packaging and runtime must stay compact, stable, and
  efficient.
- Root requirement: local performance secrets use `ueacd`.
- SDD 0106: shaped write probes remain opt-in until evidence improves total
  mixed-workload throughput.
- SDD 0107: limiter queue telemetry exists and must be used before the next
  optimization decision.

## Scope

In scope:

- Add a benchmark-report summary for gateway write-limiter diagnostics.
- Include before/after aggregate snapshots when gateway diagnostics contain
  `stats.writeLimiter`.
- Include deltas for cumulative limiter acquire counts and wait durations.
- Preserve the raw `gatewayDatabaseDiagnostics` payload.
- Keep `SESSION_DB_WRITE_CONCURRENCY=0` as the default.

Out of scope:

- Changing public Identity HTTP contracts.
- Changing token or session semantics.
- Promoting the write limiter to a default.
- Raising PostgreSQL, PgBouncer, gateway pool, or ingress limits.
- Adding caches, queues, model dependencies, OCR, RAG, vectors, embeddings, or
  training dependencies.

## Contracts Touched

- Successful and failed benchmark reports may include
  `gatewayWriteLimiterDiagnostics` when gateway diagnostics include limiter
  stats.
- Reports produced before SDD 0107, or diagnostics without `writeLimiter`, omit
  the summary.
- The summary must not include local secrets.

## Acceptance Criteria

- A focused runner test fails before implementation because
  `gatewayWriteLimiterDiagnostics` is missing.
- Focused runner tests pass after implementation.
- `node --test tools/identity-gateway-diagnostics-summary.test.mjs
  tools/run-identity-http-benchmark.test.mjs` passes.
- `npm run quality` passes.
- A follow-up 4400 Docker shaped-write probe can use the summary to compare
  limiter wait time against pgx pool wait time.

## Rollback Plan

Remove the benchmark summary helper, remove the report enhancement call sites,
and keep raw `gatewayDatabaseDiagnostics` from SDD 0107 as the only limiter
evidence source.

## Observability And Performance Evidence

Record:

- Red/green focused runner tests.
- Green strict quality gate output.
- A follow-up 4400 Docker report that includes both raw gateway diagnostics and
  `gatewayWriteLimiterDiagnostics`.
