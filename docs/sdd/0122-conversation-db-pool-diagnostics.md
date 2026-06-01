# SDD 0122: Conversation DB Pool Diagnostics

## Problem

SDD 0120 and SDD 0121 show that the current conversation write ceiling is not
the raw insert statement. The promoted 2900-concurrency profile is dominated by
`db.acquire`, while the 3000+ probes are latency boundary evidence.

The benchmark can now measure per-request `db.acquire`, `db.insert`, and
client/server gap, but it still cannot show gateway-level pgx pool counters.
That makes the next configuration decision weaker than it should be: reviewers
cannot see whether tail latency is caused by empty pool acquisitions, total
pool wait duration, canceled acquisition, connection construction, or external
PostgreSQL/PgBouncer pressure.

## Source Requirement References

- Root requirement: Research mode must remain conversation-first and stable
  under high-concurrency teaching and research workflows.
- Root requirement: runtime and package size must stay small; diagnostics must
  not add model, OCR, RAG, vector, embedding, or training dependencies.
- Root requirement: local performance secrets use `ueacd`.
- SDD 0121: client/server gap evidence is present, but the next tuning claim
  needs gateway-level DB pool counters.

## Scope

In scope:

- Add an internal conversation DB pool diagnostics endpoint protected by
  `X-Internal-Diagnostics-Secret`.
- Expose bounded pgx pool stats: max, total, acquired, idle, constructing,
  acquire count/duration, empty/canceled acquire count, new connection count,
  and destroy counters.
- Pass the diagnostics provider through the conversation gateway composition
  root.
- Collect before/after gateway DB diagnostics in the conversation benchmark
  runner and attach them to success and failure reports.
- Keep public conversation create request and response JSON unchanged.

Out of scope:

- Enabling a conversation write limiter.
- Changing public API semantics or returning new public error codes.
- Raising PostgreSQL, PgBouncer, gateway pool, or client connection limits.
- Removing schema indexes without a separate access-pattern SDD.
- Adding caches, queues, model dependencies, OCR, RAG, vectors, embeddings, or
  training dependencies.

## Contracts Touched

- `GET /internal/conversation/db-pool` returns `404` when no diagnostics
  provider is configured.
- The diagnostics route requires `X-Internal-Diagnostics-Secret: ueacd` in
  local evidence runs and returns `401` otherwise.
- Successful diagnostics responses include `{ status, service, stats }`.
- Benchmark reports may include `gatewayDatabaseDiagnostics.before` and
  `gatewayDatabaseDiagnostics.after`.
- Diagnostics reports must not contain local secret values.

## Acceptance Criteria

- A focused HTTP adapter test fails before implementation because conversation
  DB pool diagnostics are unavailable.
- A focused runner test fails before implementation because
  `gatewayDatabaseDiagnostics` is not collected or attached.
- Focused tests pass after implementation.
- `go test ./services/conversation-write-gateway/... -count=1` passes.
- `node --test tools/run-conversation-write-benchmark.test.mjs` passes.
- A live Docker-backed conversation write benchmark records before/after
  gateway DB pool diagnostics before any new performance claim is promoted.
- `npm run quality` passes before merge-ready status.

## Observability And Performance Evidence

Record:

- `reports/2026-06-01-p39-conversation-db-pool-diagnostics.md`
- `reports/conversation-write-http-benchmark.current.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-db-pool-diagnostics-repeat.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool11-client272-db-pool-diagnostics.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client260-db-pool-diagnostics.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client280-db-pool-diagnostics.json`

## Rollback

Remove the internal diagnostics route, remove the pgx pool stats adapter, and
restore the benchmark runner to the SDD 0121 report shape. Keep SDD 0121 as the
latest available conversation write bottleneck evidence.
