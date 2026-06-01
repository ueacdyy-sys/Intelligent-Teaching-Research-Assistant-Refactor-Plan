# SDD 0126: Conversation Client Trace Diagnostics

## Problem

SDD 0125 moved the Research conversation write bottleneck away from PostgreSQL
pool acquisition. At 5800 and 7000 local concurrent clients, the remaining
tail-latency growth is mostly reported as `clientServerGapMs`, calculated as
end-to-end client latency minus application `Server-Timing`.

That aggregate gap is useful but too coarse for the next optimization. It does
not distinguish client transport connection wait, request write time, server
queue/network wait before the first response byte, response body drain time, or
load-generator overhead. Without that split, the project can misclassify a
load-generator or ingress bottleneck as an application bottleneck.

## Source Requirement References

- Root requirement: Research mode must stay stable and efficient as concurrent
  teaching and research workflows scale.
- Root requirement: performance conclusions must be evidence-backed and must
  not add training, OCR, RAG, vector, embedding, or model dependencies to the
  baseline.
- SDD 0121: client/server gap needs explicit evidence before claiming an
  application ceiling.
- SDD 0125: after batched inserts, `db.acquire` is no longer the dominant
  server-side limiter; the next slice should investigate HTTP/load-generator
  gap and batch fairness.

## Scope

In scope:

- Add opt-in Go `httptrace` client-side timing to the conversation write HTTP
  benchmark.
- Report client trace timing summaries alongside existing latency,
  `Server-Timing`, and client/server gap summaries.
- Add a derived first-byte-minus-app gap so the report can separate
  application processing from transport, ingress, or server-queue delay.
- Keep client trace disabled by default so capacity benchmarks are not distorted
  by diagnostic instrumentation overhead.
- Keep benchmark request shape, gateway API, repository behavior, database
  schema, batching configuration, and performance profile unchanged.

Out of scope:

- Claiming a new high-concurrency ceiling without a fresh Docker-backed
  benchmark run.
- Changing gateway runtime settings, PgBouncer, PostgreSQL, ingress proxy
  behavior, or application code paths.
- Adding external load-test tools, package dependencies, model dependencies,
  OCR, RAG, embeddings, vectors, or training components.

## Contracts Touched

Benchmark phase reports may now include:

- `clientTraceEnabled`: top-level flag showing whether per-request client trace
  instrumentation was enabled for the run.
- `clientTraceBreakdownMs`: latency summaries for client-side trace components.
- `clientTraceBreakdownSamples`: sample counts for those components.

Trace metric names:

- `client.request_prepare`: JSON encode, request construction, and header setup.
- `client.transport_wait`: time from prepared request to `GotConn`.
- `client.request_write`: time from `GotConn` to `WroteRequest`.
- `client.first_response_byte_wait`: time from `WroteRequest` to first response
  byte.
- `client.response_body_read`: time from first response byte to response body
  close.
- `client.round_trip`: time from prepared request to response body close.
- `client.first_byte_app_gap`: derived
  `client.first_response_byte_wait - Server-Timing app`, clamped at zero.

Existing report fields remain compatible.

Runner contract:

- `tools/run-conversation-write-benchmark.mjs` accepts `--client-trace true`.
- When omitted or `false`, the runner leaves `cmd/httpbench` in pure capacity
  mode and no `clientTraceBreakdownMs` fields are expected.

## Acceptance Criteria

- Focused httpbench tests prove phase reports include client trace summaries.
- Focused httpbench tests prove fixed client trace timestamps map to stable
  metric names and durations.
- Focused httpbench tests prove request-level trace capture is opt-in and pure
  benchmark mode still records `Server-Timing`.
- Runner tests prove `--client-trace true` is forwarded to `cmd/httpbench` and
  represented in failure and enriched reports.
- Existing `Server-Timing` and client/server gap report tests continue passing.
- `go test ./services/conversation-write-gateway/cmd/httpbench -count=1`
  passes.
- `go test ./services/conversation-write-gateway/... -count=1` passes.
- `node --test tools/run-conversation-write-benchmark.test.mjs` passes.
- `npm run quality` passes before merge-ready status.
- No runtime dependency, package dependency, database schema, model, OCR, RAG,
  vector, embedding, or training dependency is added.

## Rollback

Remove the client trace fields, `httptrace` callbacks, focused tests, and this
SDD. The existing benchmark runner continues to emit latency, `Server-Timing`,
and aggregate client/server gap evidence.

## Observability And Performance Evidence

Record:

- red or focused test intent for client trace breakdown;
- `go test ./services/conversation-write-gateway/cmd/httpbench -count=1`;
- `go test ./services/conversation-write-gateway/... -count=1`;
- `node --test tools/run-conversation-write-benchmark.test.mjs`;
- `npm run quality`;
- pure-capacity benchmark reports with `clientTraceEnabled=false`;
- targeted diagnostic benchmark reports that pass `--client-trace true` and
  include `clientTraceBreakdownMs`.
