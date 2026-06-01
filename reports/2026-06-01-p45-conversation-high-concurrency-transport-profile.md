# Conversation High-Concurrency Transport Profile

## Summary

This slice retested the Research conversation write gateway after batched
inserts and client trace diagnostics. The best current local Docker-backed
profile remains:

- 16 local gateway workers
- 1 application-side PostgreSQL connection per worker
- PgBouncer transaction pooling
- `CONVERSATION_WRITE_BATCH_SIZE=64`
- `CONVERSATION_WRITE_BATCH_DELAY_MS=0`
- warmed client keep-alive transport
- client trace disabled for pure capacity runs

The database pool is no longer the limiter. Across the new probes,
`db.acquire` P99 stayed at or near 0ms. The remaining ceiling is local
client/Windows socket and gateway-listener scheduling pressure.

## Evidence

| Report | Status | Concurrency | MaxConnsPerHost | RPS | P95 ms | P99 ms | Server P99 ms | DB acquire P99 ms | Errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `conversation-write-http-benchmark.direct16-concurrency5800-multi16-pool1-client-unlimited-batched64-delay0.json` | PASSED | 5800 | 0 | 21969.45 | 270.67 | 349.90 | 64.61 | 0.00 | 0 |
| `conversation-write-http-benchmark.direct16-concurrency6200-multi16-pool1-client-unlimited-batched64-delay0.json` | FAILED | 6200 | 0 | 21997.54 | 333.12 | 407.05 | 58.25 | 0.57 | 1 |
| `conversation-write-http-benchmark.direct16-concurrency6200-multi16-pool1-client388-batched64-delay0.json` | PASSED | 6200 | 388 | 18240.00 | 443.20 | 549.60 | 66.42 | 0.00 | 0 |
| `conversation-write-http-benchmark.direct16-concurrency6400-multi16-pool1-client400-batched64-delay0.json` | PASSED | 6400 | 400 | 15901.34 | 552.85 | 664.28 | 91.43 | 0.00 | 0 |
| `conversation-write-http-benchmark.direct16-concurrency7000-multi16-pool1-client438-batched64-delay0.json` | PASSED | 7000 | 438 | 15449.27 | 695.39 | 729.13 | 81.37 | 0.00 | 0 |

Diagnostic trace probe:

- `conversation-write-http-benchmark.direct16-concurrency5800-multi16-pool1-client362-batched64-delay0-client-trace.json`
- 5800 concurrency, 362 connections per host, 0 errors
- End-to-end P99: 490.93ms
- Server P99: 91.56ms
- `client.transport_wait` P99: 272.53ms
- `client.first_byte_app_gap` P99: 227.29ms

The trace result confirms that the high-concurrency tail is mostly outside the
application DB write path.

## Interpretation

5800 concurrency is the current strongest low-tail local capacity point in this
slice. It stayed at 0 errors with P99 below 500ms while preserving only 16
application-side PostgreSQL connections.

6200 concurrency is the edge. With unlimited client connections, the app path
looked healthy but Windows returned one socket buffer or queue exhaustion error.
With a per-host cap, it passed with 0 errors, but P99 rose above 500ms.

6400 and 7000 concurrency are functional capacity probes, not low-latency
claims. They stayed error-free with bounded client connections, but P95/P99 show
that listener, client transport, or local OS scheduling pressure dominates.

## Configuration Decision

Do not raise application DB pools to chase this bottleneck. PgBouncer and the
batch insert repository already removed DB acquisition from the P99 tail.

Keep the promoted write-path configuration:

- `gateway-count=16`
- `DB_MAX_CONNS=1`
- `CONVERSATION_WRITE_BATCH_SIZE=64`
- `CONVERSATION_WRITE_BATCH_DELAY_MS=0`

For benchmark profiles:

- Use `--client-trace true` only for diagnosis.
- Use pure capacity mode by default so client instrumentation does not distort
  throughput and tail latency.
- Shape client connections near each gateway share at extreme concurrency to
  avoid Windows socket buffer exhaustion.

## Next Work

The next optimization should not be another DB pool increase. The next useful
slice is one of:

- run the same profile from an external Linux/WSL load generator to remove
  Windows localhost socket pressure from the measurement;
- add gateway listener and accept-queue diagnostics;
- add an explicit production ingress profile and compare direct multi-gateway
  routing against one or more reverse-proxy front doors;
- test longer steady-state runs, because the current benchmark is a short burst
  that stresses connection scheduling heavily.

## Cleanup

The performance Docker profile must be stopped after the benchmark slice and
`research_conversations` must be truncated before leaving the environment.
