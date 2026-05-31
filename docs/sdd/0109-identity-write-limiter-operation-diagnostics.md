# SDD 0109: Identity Write Limiter Operation Diagnostics

## Problem

SDD 0107 and SDD 0108 expose total Identity session write-limiter queue
pressure. The 4400-concurrency shaped-write evidence showed that the limiter
mostly moves pgx pool wait into the application write-slot queue, but the report
still cannot tell which write operation creates that queue.

That is too coarse for the next optimization decision. Login session inserts,
refresh rotation, self revoke, cleanup, and remote command replay protection
have different product semantics and different rollback risk. The diagnostics
must attribute limiter wait to the operation type before changing defaults or
session behavior.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- Root requirement: packaging and runtime must stay compact, stable, and
  efficient.
- Root requirement: local performance secrets use `ueacd`.
- SDD 0108: shaped write probes proved total limiter wait, but not which
  operation caused it.

## Scope

In scope:

- Add operation-level counters to `SessionWriteLimiterStats`.
- Attribute write-slot acquire count, wait time, canceled acquire count, and
  canceled wait time by operation.
- Include operation summaries and deltas in benchmark
  `gatewayWriteLimiterDiagnostics`.
- Preserve existing total limiter counters and raw diagnostics.
- Keep `SESSION_DB_WRITE_CONCURRENCY=0` as the default.

Out of scope:

- Changing public Identity HTTP contracts.
- Changing token rotation, logout, remote command, or cleanup semantics.
- Promoting the write limiter to a default.
- Raising PostgreSQL, PgBouncer, gateway pool, or ingress limits.
- Adding caches, queues, model dependencies, OCR, RAG, vectors, embeddings, or
  training dependencies.

## Contracts Touched

- Internal gateway database diagnostics may include
  `stats.writeLimiter.operations`.
- Benchmark reports may include operation-level aggregate snapshots and deltas
  under `gatewayWriteLimiterDiagnostics`.
- Reports produced before this SDD remain valid; missing operation diagnostics
  are treated as absent rather than failure.
- The summary must not include local secrets.

## Acceptance Criteria

- Focused Go tests fail before implementation because operation-level limiter
  stats are not exposed.
- Focused runner tests fail before implementation because operation summaries
  are not aggregated.
- Focused Go and runner tests pass after implementation.
- `npm run quality` passes.
- A follow-up Docker shaped-write probe can identify which Identity write
  operation contributes most write-slot queue time.

## Rollback Plan

Remove operation-level limiter fields and benchmark aggregation. Keep the total
write-limiter counters from SDD 0107 and the aggregate benchmark summary from
SDD 0108.

## Observability And Performance Evidence

Record:

- Red/green focused Go and runner tests.
- Green strict quality gate output.
- A follow-up 4400 Docker report that includes operation-level limiter
  diagnostics.
