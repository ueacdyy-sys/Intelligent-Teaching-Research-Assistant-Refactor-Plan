# Conversation Client Trace Diagnostics

## Summary

SDD 0126 adds client-side `httptrace` timing to the Research conversation write
HTTP benchmark. This does not change the gateway, repository, batching profile,
PostgreSQL, PgBouncer, or ingress behavior. It makes the next performance run
more diagnostic by splitting the existing aggregate `clientServerGapMs` into
transport and response phases.

## Why This Slice

After SDD 0125, the promoted `16 gateways x pool1 x batch64 x delay0` write
profile removed DB acquisition as the hot tail. At 5800 and 7000 local
concurrency, the visible limit is now mostly outside `Server-Timing app`.
Before changing worker counts, ingress topology, Docker load generation, or
runtime socket settings again, the benchmark report needs enough timing detail
to prove where the gap lives.

## Implementation

- `cmd/httpbench` now attaches a Go `httptrace.ClientTrace` only when the
  benchmark is run with `--client-trace`.
- Phase reports now include `clientTraceBreakdownMs` and
  `clientTraceBreakdownSamples` when trace samples exist.
- Reports include `clientTraceEnabled` so pure capacity runs and diagnostic
  trace runs are distinguishable.
- `tools/run-conversation-write-benchmark.mjs` forwards `--client-trace true`
  to the Go benchmark and leaves trace disabled by default.
- The report keeps the existing `clientServerGapMs` aggregate for continuity.
- A derived `client.first_byte_app_gap` metric subtracts `Server-Timing app`
  from client first-byte wait, clamped at zero.

Trace fields:

- `client.request_prepare`
- `client.transport_wait`
- `client.request_write`
- `client.first_response_byte_wait`
- `client.response_body_read`
- `client.round_trip`
- `client.first_byte_app_gap`

## Acceptance Evidence

Commands run:

```powershell
go test ./services/conversation-write-gateway/cmd/httpbench -count=1
go test ./services/conversation-write-gateway/... -count=1
node --test tools/run-conversation-write-benchmark.test.mjs
npm run quality
```

Results:

- `go test ./services/conversation-write-gateway/cmd/httpbench -count=1`: PASS.
- `go test ./services/conversation-write-gateway/... -count=1`: PASS.
- `node --test tools/run-conversation-write-benchmark.test.mjs`: PASS, 6 tests.
- `npm run quality`: PASS.

Follow-up adjustment:

- After the first 5800 trace run, client trace was made opt-in because the
  diagnostic callbacks and per-operation timing maps add load-generator
  overhead. Pure capacity reports should keep `clientTraceEnabled=false`; only
  root-cause probes should pass `--client-trace true`.

## Next Evidence Run

The next Docker-backed high-concurrency Research write run should include the
new trace fields only for diagnostic probes and compare:

- 2900 concurrency promoted current profile;
- 5800 concurrency current capacity profile;
- 7000 concurrency limit probe.

The decision point is:

- high `client.transport_wait` means load-generator transport queue or
  per-host connection cap pressure;
- high `client.first_byte_app_gap` means ingress, accept queue, network, or
  server pre-handler pressure;
- high `client.response_body_read` means response drain/backpressure;
- low client trace components with high app timing means the gateway path itself
  is again the target.

## Cleanup

- No Docker containers were started for this instrumentation-only slice.
- No benchmark rows were written.
- No package, lockfile, model, OCR, RAG, embedding, vector, or training
  dependency was added.
