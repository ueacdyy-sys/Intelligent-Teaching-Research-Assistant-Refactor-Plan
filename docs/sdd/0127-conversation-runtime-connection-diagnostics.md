# SDD 0127: Conversation Runtime Connection Diagnostics

## Problem

SDD 0125 and SDD 0126 show that the Research conversation write path no longer
has database pool acquisition as the high-concurrency limiter. The latest
5800-7000 concurrency probes show large client/server gaps, and the 6200
unlimited-client probe produced a Windows socket buffer or queue exhaustion
error while `Server-Timing app` and `db.acquire` remained low.

The gateway currently exposes database pool diagnostics, but it does not expose
runtime listener or connection-state counters. Without those counters, the next
optimization could incorrectly tune PostgreSQL or batching when the measured
pressure is actually connection scheduling, accept/listener behavior, or local
load-generator transport pressure.

## Source Requirement References

- Root requirement: Research mode must remain stable and efficient as
  concurrent teaching and research workflows scale.
- Root requirement: performance conclusions must be evidence-backed and must
  not add training, OCR, RAG, vector, embedding, or model dependencies to the
  baseline.
- SDD 0121: client/server gap must be split before claiming an application
  ceiling.
- SDD 0125: DB acquire is no longer the dominant server-side limiter after
  batched inserts.
- SDD 0126: client trace should be opt-in and high-concurrency runs need
  transport/listener evidence.

## Scope

In scope:

- Add a runtime connection-state statistics provider for the conversation write
  gateway process.
- Wire `http.Server.ConnState` into that provider.
- Expose an internal diagnostics endpoint protected by
  `X-Internal-Diagnostics-Secret`.
- Extend the benchmark runner to collect runtime diagnostics before and after a
  run, alongside existing DB/PgBouncer/PostgreSQL diagnostics.
- Keep diagnostics passive and read-only.

Out of scope:

- Changing gateway API behavior, persistence behavior, database schema,
  PgBouncer settings, PostgreSQL settings, batching behavior, or public
  contracts.
- Claiming a new concurrency ceiling without a fresh benchmark run.
- Adding external load-test tools, package dependencies, model dependencies,
  OCR, RAG, embeddings, vectors, or training components.

## Contracts Touched

New internal endpoint:

- `GET /internal/conversation/runtime`
- Requires `X-Internal-Diagnostics-Secret`.
- Returns:
  - `status`
  - `service`
  - `stats.acceptedConns`
  - `stats.currentConns`
  - `stats.maxCurrentConns`
  - `stats.activeConns`
  - `stats.idleConns`
  - `stats.hijackedConns`
  - `stats.closedConns`

Benchmark reports may include:

- `gatewayRuntimeDiagnostics.before`
- `gatewayRuntimeDiagnostics.after`

Existing report fields remain compatible.

## Acceptance Criteria

- HTTP adapter tests prove runtime diagnostics are unavailable without a
  provider.
- HTTP adapter tests prove runtime diagnostics require the internal secret.
- HTTP adapter tests prove runtime stats are returned without leaking the local
  secret.
- Gateway tests prove `ConnState` transitions maintain current, active, idle,
  max-current, closed, and hijacked counters.
- Runner tests prove runtime diagnostics are collected and attached to
  successful reports.
- `go test ./services/conversation-write-gateway/... -count=1` passes.
- `node --test tools/run-conversation-write-benchmark.test.mjs` passes.
- `npm run quality` passes before merge-ready status.
- No runtime dependency, package dependency, database schema, model, OCR, RAG,
  vector, embedding, or training dependency is added.

## Rollback

Remove the runtime stats provider, `ConnState` wiring, internal runtime
diagnostics endpoint, runner collection field, tests, and this SDD. Existing DB
pool, PgBouncer, PostgreSQL, server timing, client trace, and performance
evidence behavior remains intact.

## Observability And Performance Evidence

Record:

- focused failing tests for runtime diagnostics;
- `go test ./services/conversation-write-gateway/... -count=1`;
- `node --test tools/run-conversation-write-benchmark.test.mjs`;
- `npm run quality`;
- the first benchmark report that contains `gatewayRuntimeDiagnostics` after a
  high-concurrency or diagnostic run.
