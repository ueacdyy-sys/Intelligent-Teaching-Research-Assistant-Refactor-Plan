# SDD 0124: Conversation Worker Fan-out Under Same DB Budget

## Problem

SDD 0122 and SDD 0123 show that the current Research conversation write profile
is dominated by `db.acquire`, while the insert itself remains much smaller. The
current promoted profile uses eight gateway processes with ten PostgreSQL pool
connections each, for eighty application-side database connections behind
PgBouncer.

Blindly increasing pool size worsened tail latency, so the next safe
configuration question is whether the same total database budget performs
better when split across more gateway listeners and smaller per-worker pools.
That tests HTTP/runtime fan-out without increasing PostgreSQL pressure.

## Source Requirement References

- Root requirement: Research mode must stay conversation-first, stable, and
  efficient under high-concurrency teaching and research workflows.
- Root requirement: runtime and package size must remain small and verifiable.
- Root requirement: local performance secrets use `ueacd`.
- SDD 0122: pool11 and client-cap changes were negative probes; keep the total
  PostgreSQL pressure bounded.
- SDD 0123: title index creation is deferred, but DB acquire wait remains the
  dominant bottleneck.

## Scope

In scope:

- Test a ten-gateway conversation write profile with eight DB pool connections
  per gateway, preserving the current eighty total application-side DB
  connection budget.
- Keep PgBouncer transaction pooling and max DB connections unchanged.
- Keep request/response JSON, schema, indexes, event semantics, and local
  secrets unchanged.
- Record gateway DB diagnostics before and after the benchmark.
- Promote the profile only if repeat evidence improves tail latency without
  errors.

Out of scope:

- Increasing total application-side DB connections beyond the current eighty.
- Raising PostgreSQL or PgBouncer limits.
- Introducing async write queues, caches, model dependencies, OCR, RAG, vector,
  embedding, or training dependencies.
- Replacing the public Research conversation API.

## Contracts Touched

This is a performance profile SDD. It should not require production code or
OpenAPI changes unless evidence proves a reusable runtime configuration must be
made explicit.

Benchmark evidence may update:

- `reports/conversation-write-http-benchmark.current.json`
- `contracts/ops/performance-evidence-registry.current.json`
- `reports/performance-evidence-registry.current.json`

## Acceptance Criteria

- A Docker-backed ten-gateway benchmark runs with:
  - gateway count: 10;
  - DB pool per gateway: 8;
  - total application-side DB connections: 80;
  - local secret: `ueacd`;
  - zero benchmark errors.
- The result records `db.acquire`, `db.insert`, client/server gap, and gateway
  DB pool diagnostics.
- The profile is promoted only when repeat evidence improves the current
  low-latency claim or clearly expands capacity without crossing the target.
- Negative or noisy results are kept as evidence and do not replace the current
  eight-gateway profile.
- `npm run audit:performance-evidence` passes after registry updates.
- `npm run quality` passes before merge-ready status.

## Observability And Performance Evidence

Record:

- `reports/2026-06-01-p41-conversation-worker-fanout-budget.md`
- candidate benchmark reports named with `direct10-concurrency2900`.

## Rollback

If the ten-gateway profile is not promoted, keep SDD 0123 as the current
conversation write performance claim and do not change runtime defaults.
