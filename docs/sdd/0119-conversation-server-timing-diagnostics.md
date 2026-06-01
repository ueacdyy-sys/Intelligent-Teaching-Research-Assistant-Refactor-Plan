# SDD 0119: Conversation Server Timing Diagnostics

## Problem

SDD 0118 raised the Research conversation write current profile to direct
eight-gateway 3000 concurrency, but P99 remains above the 500ms target. The
current benchmark reports only end-to-end client latency, so it cannot prove
whether high-load tail variance comes from server-side create/insert work or
from client transport, listener scheduling, and local runtime pressure.

Without a server-side timing signal, the next optimization would again risk
tuning the wrong layer.

## Source Requirement References

- Root requirement: Research mode is conversation-first and must remain
  efficient and stable for high-concurrency teaching and research workflows.
- SDD 0001: Research conversation creation remains the first Go hot-path
  migration candidate with P95 below 500ms and 0 failures.
- SDD 0118: direct eight-gateway 3000 is the current P95-low-latency point, but
  P99 tail variance remains above target.

## Scope

In scope:

- Add a standard `Server-Timing` response header to successful Research
  conversation creation responses.
- Measure only the server-side application create path around the use case.
- Parse the `Server-Timing` header in the Go HTTP benchmark.
- Record a `serverTimingMs` latency summary in the createConversation phase
  when samples are present.
- Keep the OpenAPI request/response body shape unchanged.
- Keep runtime dependencies unchanged.

Out of scope:

- Changing database schema, durability, or PgBouncer capacity.
- Adding distributed tracing infrastructure.
- Retrying non-idempotent conversation writes.
- Promoting a higher concurrency point without live benchmark evidence.

## Contracts Touched

- `services/conversation-write-gateway/internal/adapter/httpapi` emits
  `Server-Timing: app;dur=<milliseconds>` for create responses.
- `services/conversation-write-gateway/cmd/httpbench` parses the timing header
  and reports server-side timing percentiles beside end-to-end latency.

## Acceptance Criteria

- HTTP adapter tests prove successful create responses include a
  `Server-Timing` app duration.
- HTTP benchmark tests prove `Server-Timing` is parsed from response headers.
- Phase reports include `serverTimingMs` only when samples are observed.
- Existing latency reports remain backwards compatible.
- `go test ./services/conversation-write-gateway/...` passes.
- `npm run quality` passes before merge-ready status.

## Observability And Performance Evidence

This slice is diagnostic. It should explain whether the P99 tail is primarily
inside the server create path or outside it. Live benchmark evidence can then
decide whether the next optimization should target the database/use case,
gateway listener behavior, or benchmark/client transport shaping.

Current evidence is recorded in:

- `reports/2026-06-01-p36-conversation-server-timing-diagnostics.md`
- `reports/conversation-write-http-benchmark.current.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency3100-multi8-warm388-server-timing-repeat.json`

## Rollback

Remove the `Server-Timing` response header, remove benchmark parsing and
`serverTimingMs` report fields, then remove this SDD.
