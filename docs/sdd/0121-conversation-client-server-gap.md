# SDD 0121: Conversation Client Server Gap

## Problem

SDD 0120 split the Research conversation write server timing into `app`,
`db.acquire`, and `db.insert`. The promoted 3000-concurrency profile still has
an end-to-end P99 above the server-side P99. That remaining gap decides whether
the next optimization should target transport/listener scheduling, gateway
fan-out, or more server-side write-path work.

Without a per-operation derived gap, reports can only compare aggregate client
P99 and aggregate server P99. Aggregate subtraction is weak evidence because
percentiles may come from different requests.

## Source Requirement References

- Root requirement: Research mode must stay conversation-first and stable under
  high-concurrency teaching and research workflows.
- Root requirement: runtime and package size must stay small; diagnostics must
  not add model, OCR, RAG, vector, embedding, or training dependencies.
- SDD 0120: DB acquire dominates server-side create time, while 3050 and 3100
  remain latency boundary probes.

## Scope

In scope:

- Add a derived `clientServerGapMs` summary to the Go HTTP benchmark phase
  report when an `app` `Server-Timing` value is present for the same operation.
- Keep existing `serverTimingMs` and `serverTimingBreakdownMs` fields
  compatible.
- Keep public gateway request and response JSON unchanged.
- Keep runtime dependencies unchanged.

Out of scope:

- Changing gateway worker count, database pool size, schema, or PgBouncer
  limits.
- Claiming a higher concurrency point without live benchmark evidence.
- Adding external tracing infrastructure.

## Contracts Touched

- `services/conversation-write-gateway/cmd/httpbench` derives per-operation
  `clientServerGapMs = client latency - app Server-Timing` and reports a
  latency summary plus sample count.
- `contracts/ops/performance-evidence-registry.current.json` may cite the gap
  metric after a live benchmark refresh.

## Acceptance Criteria

- HTTP benchmark tests prove the phase report includes `clientServerGapMs` and
  `clientServerGapSamples` when matching `app` timing samples exist.
- Existing benchmark JSON readers remain compatible through the unchanged
  `latencyMs`, `serverTimingMs`, and `serverTimingBreakdownMs` fields.
- `go test ./services/conversation-write-gateway/...` passes.
- A live 3000-concurrency benchmark refresh records the client/server gap before
  the next transport or proxy tuning claim.
- `npm run quality` passes before merge-ready status.

## Observability And Performance Evidence

Current evidence is recorded in:

- `reports/2026-06-01-p38-conversation-client-server-gap.md`
- `reports/conversation-write-http-benchmark.current.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-gap.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-gap-repeat.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-pool10-client280-gap-repeat2.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-pool10-client280-gap-repeat3.json`

## Rollback

Remove the derived `clientServerGapMs` and `clientServerGapSamples` benchmark
fields, remove this SDD and its evidence report, then restore the previous
current benchmark evidence.
