# SDD 0012: Identity HTTP Gateway Benchmark

## Problem

The Identity session benchmark currently measures the PostgreSQL adapter path through PgBouncer. That proves durable session storage capacity, but real clients use the HTTP gateway. HTTP routing, JSON decoding/encoding, authorization headers, and handler error mapping can change latency enough that adapter-only measurements are not sufficient for a routed migration decision.

The refactor needs a repeatable HTTP benchmark that starts the real Identity Access Gateway with the PgBouncer session store and measures client-facing login, principal lookup, refresh rotation, and revoke cycle behavior.

## Source Requirement References

- Root requirement: teacher login, student app login, and remote/social command entry are shared whole-system entry points.
- SDD 0007: Identity Access Gateway owns the HTTP contract.
- SDD 0011: adapter benchmark showed durable session storage is viable; the next evidence must cover the HTTP gateway path.

## Scope

In scope:

- Add an HTTP-only benchmark command that talks to a running gateway by URL.
- Add a Node runner that starts the real `cmd/gateway` with `SESSION_DATABASE_URL` pointing at identity PgBouncer.
- Measure four client-facing phases:
  - password login
  - principal lookup
  - refresh rotation
  - revoke cycle
- Emit JSON with latency/RPS/error metrics and masked URL values.
- Keep root tests Docker-free and gateway-process-free.

Out of scope:

- Full mixed legacy plus Go load tests.
- Browser or UI login flow tests.
- WeChat callback provider implementation.
- Production SLO enforcement.

## Contracts

- Command: `go run ./services/identity-access-gateway/cmd/httpbench`
- Runner: `tools/run-identity-http-benchmark.mjs`
- Script: `npm run bench:identity-http:pgbouncer`
- Report: `reports/identity-http-benchmark.current.json`

## Acceptance Criteria

- Pure benchmark math has unit tests.
- The HTTP benchmark fails fast when `base-url` is missing or unreachable.
- The benchmark report includes separate phase metrics for login, lookup, refresh, and revoke.
- The runner starts the real gateway with `SESSION_DATABASE_URL`, `SESSION_DB_MAX_CONNS`, `BOOTSTRAP_PASSWORD`, and `CHANNEL_SIGNATURE_SECRET`.
- The runner waits for `/health` before starting the benchmark, with a startup timeout large enough for `go run` cold starts, and stops the gateway afterward.
- Root `npm test` passes.
- With the identity-only PgBouncer profile running, the HTTP benchmark completes and writes the report.

## Rollback

The HTTP benchmark is a standalone command and runner. Stop the identity runtime profile with:

```powershell
npm run perf:identity-session:down
```

No production routing depends on this benchmark.

## Observability And Performance Evidence

Each run records:

- gateway base URL
- concurrency
- operations per phase
- per-phase error count
- per-phase RPS
- per-phase average, P50, P95, P99, min, max latency
