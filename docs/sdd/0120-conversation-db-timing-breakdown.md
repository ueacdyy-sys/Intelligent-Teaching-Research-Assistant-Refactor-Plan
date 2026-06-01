# SDD 0120: Conversation DB Timing Breakdown

## Problem

SDD 0119 proved that the promoted direct eight-gateway 3000 Research
conversation write profile has a large P99 gap outside the measured server
application create path. The same evidence also showed that the 3100 repeat
boundary raises both server-side and end-to-end latency.

The current `Server-Timing: app` signal still hides database pool acquisition
and SQL execution inside one application duration. Without a lower-level timing
breakdown, the next optimization could incorrectly tune gateway worker count,
HTTP transport, or database pool size.

## Source Requirement References

- Root requirement: Research mode is conversation-first and must stay stable
  for high-concurrency teaching and research workflows.
- Root requirement: runtime and packaging must stay small; performance
  diagnostics must not add model, OCR, RAG, vector, embedding, or training
  dependencies.
- SDD 0119: direct eight-gateway 3000 remains the current P95-low-latency claim,
  but P99 has a measurable non-application gap.

## Scope

In scope:

- Add request-scoped, aggregate-free timing for the conversation DB acquire and
  INSERT portions of a successful create operation.
- Emit the additional timings as `Server-Timing` metrics beside `app`.
- Teach the Go HTTP benchmark to retain `app` as the backwards-compatible
  `serverTimingMs` summary while also reporting a metric-keyed
  `serverTimingBreakdownMs` map.
- Keep public request/response JSON unchanged.
- Keep runtime dependencies unchanged.

Out of scope:

- Changing database schema, durability, indexes, PgBouncer capacity, or DB pool
  limits.
- Adding external tracing infrastructure.
- Promoting a higher concurrency point without live benchmark evidence.

## Contracts Touched

- `services/conversation-write-gateway/internal/adapter/postgres` records
  request-scoped database timing when a recorder is present in the context.
- `services/conversation-write-gateway/internal/adapter/httpapi` emits
  `Server-Timing` metrics for `app`, `db.acquire`, and `db.insert` when the DB
  timings are present.
- `services/conversation-write-gateway/cmd/httpbench` parses all
  `Server-Timing` metrics and reports per-metric summaries.

## Acceptance Criteria

- Repository tests prove create records DB acquire and insert timings through a
  request-scoped recorder.
- HTTP adapter tests prove successful create responses include `app`,
  `db.acquire`, and `db.insert` timing metrics when available.
- HTTP benchmark tests prove multiple `Server-Timing` metrics are parsed and
  reported in `serverTimingBreakdownMs`.
- Existing benchmark JSON readers remain compatible through `serverTimingMs`
  for the `app` metric.
- `go test ./services/conversation-write-gateway/...` passes.
- Live 3000/3100 benchmark evidence records the DB timing breakdown before any
  next optimization claim.
- `npm run quality` passes before merge-ready status.

## Observability And Performance Evidence

Current evidence is recorded in:

- `reports/2026-06-01-p37-conversation-db-timing-breakdown.md`
- `reports/conversation-write-http-benchmark.current.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency3050-multi8-pool10-client280-db-timing.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency3100-multi8-pool10-client280-db-timing-repeat.json`

## Rollback

Remove the request-scoped DB timing recorder, remove the extra `Server-Timing`
metrics and benchmark breakdown fields, then remove this SDD and its evidence
reports.
