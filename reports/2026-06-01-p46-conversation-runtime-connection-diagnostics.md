# Conversation Runtime Connection Diagnostics

## Summary

SDD 0127 adds passive runtime connection diagnostics to the Research
conversation write gateway. This does not change the public API, write path,
database schema, PgBouncer configuration, PostgreSQL configuration, batching
behavior, or baseline dependencies.

The new internal endpoint is:

- `GET /internal/conversation/runtime`
- protected by `X-Internal-Diagnostics-Secret`
- collected by the conversation write benchmark runner before and after each
  run as `gatewayRuntimeDiagnostics`

## Why This Slice

The previous high-concurrency evidence showed that `db.acquire` is no longer
the bottleneck. At 5800-7000 local concurrency, the remaining latency is mostly
client/server gap and Windows socket or listener pressure. Runtime connection
counters give the next optimization slice evidence about gateway listener load
instead of forcing another round of database-pool guessing.

## Implementation

- Added `platform.ConversationRuntimeStats` and
  `platform.ConversationRuntimeStatsProvider`.
- Added a gateway-local `connectionStateTracker` wired to
  `http.Server.ConnState`.
- Added `/internal/conversation/runtime` to the HTTP adapter.
- Added `collectGatewayRuntimeDiagnostics` to
  `tools/run-conversation-write-benchmark.mjs`.
- Successful and failed runner reports can now include
  `gatewayRuntimeDiagnostics`.

## Acceptance Evidence

Commands run:

```powershell
go test ./services/conversation-write-gateway/... -count=1
node --test tools/run-conversation-write-benchmark.test.mjs
```

Results:

- `go test ./services/conversation-write-gateway/... -count=1`: PASS.
- `node --test tools/run-conversation-write-benchmark.test.mjs`: PASS, 6 tests.

## Runtime Evidence Run

Command:

```powershell
npm run bench:conversation-write:pgbouncer -- --gateway-count 16 --db-max-conns 1 --write-batch-size 64 --write-batch-delay-ms 0 --agent-api-key ueacd --concurrency 5800 --operations 11600 --max-conns-per-host 0 --warm-connections-per-host 362 --warm-connection-retries 3 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 240 --out reports/conversation-write-http-benchmark.direct16-concurrency5800-multi16-pool1-client-unlimited-batched64-delay0-runtime-diagnostics.json --timeout 900s --startup-timeout-ms 120000
```

Result:

| Metric | Value |
| --- | ---: |
| status | PASSED |
| concurrency | 5800 |
| errors | 0 |
| RPS | 16049.78 |
| P95 ms | 451.24 |
| P99 ms | 588.35 |
| server P99 ms | 103.48 |
| DB acquire P99 ms | 0 |
| runtime gateways sampled before | 16 |
| runtime gateways sampled after | 16 |
| accepted connections total after | 6271 |
| max current connections per gateway | 364-414 |
| current connections total after | 16 |
| closed connections total after | 6255 |

This run is diagnostic evidence only. It should not replace the stronger
5800-capacity report from P45 because its P99 is above the low-tail target.
The important result is that runtime diagnostics are now present in a real
Docker-backed high-concurrency report.

## Cleanup

- `research_conversations` was truncated after the run.
- The Docker performance compose profile was stopped.
- Temporary benchmark log output was removed.

## Next Work

Use the new runtime diagnostics in the next high-concurrency comparison:

- external Linux/WSL load generator versus Windows-local load generator;
- direct multi-gateway routing versus production ingress;
- short burst versus longer steady-state profile.

Promotion should require low tail latency and zero errors, not only a successful
runtime diagnostics sample.
