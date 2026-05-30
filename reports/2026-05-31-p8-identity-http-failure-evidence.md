# P8 Identity HTTP Failure Evidence

## Summary

Added SDD 0082 and made the Identity HTTP benchmark runner write a structured
JSON report when a live benchmark fails.

The useful current limit evidence is now:

- `reports/identity-http-benchmark.current.json`: 320 concurrency, 640
  operations per phase, `PASSED`.
- `reports/identity-http-benchmark.concurrency360.json`: 360 concurrency, 720
  operations per phase, `FAILED` during `passwordLogin`.

## Performance Interpretation

The current single local Go gateway, running against the identity-only Docker
PgBouncer profile, supports a repeatable 320-concurrency read/write session
workload on this Windows host.

The nearest current limit probe is 360 concurrency. It failed in
`passwordLogin` with connection refusals while the runner still observed the
gateway process as alive before cleanup:

- `gatewayExitCode`: `null`
- `gatewaySignal`: `null`

That makes the evidence more consistent with local accept/connect pressure than
with a captured gateway crash. The database path still matters: a comparison
run with `SESSION_DB_MAX_CONNS=32` improved write-path latency, but it did not
move the 360-512 failure threshold enough to claim ultra-high concurrency.

The identity-only runtime profile is also below the general PgBouncer
performance profile:

- Identity profile: PostgreSQL `max_connections=120`, `shared_buffers=256MB`,
  PgBouncer `max_db_connections=32`.
- General current performance profile evidence: PostgreSQL
  `max_connections=300`, `shared_buffers=1GB`, PgBouncer
  `max_db_connections=90`.

## Files

- `docs/sdd/0082-identity-http-benchmark-failure-evidence.md`
- `tools/run-identity-http-benchmark.mjs`
- `tools/run-identity-http-benchmark.test.mjs`
- `services/identity-access-gateway/cmd/httpbench/main.go`
- `contracts/ops/performance-evidence-registry.schema.json`
- `contracts/ops/performance-evidence-registry.current.json`
- `reports/identity-http-benchmark.current.json`
- `reports/identity-http-benchmark.concurrency360.json`
- `reports/performance-evidence-registry.current.json`

## Verification

Red focused tests:

- `node --test tools/run-identity-http-benchmark.test.mjs`: failed before the
  runner exported a failure-report builder.
- `node --test tools/performance-evidence-registry-audit.test.mjs`: failed
  before HTTP benchmark report `status` was enforced.

Focused and live checks:

- `node --test tools/run-identity-http-benchmark.test.mjs`: passed.
- `node --test tools/performance-evidence-registry-audit.test.mjs`: passed.
- `go test ./services/identity-access-gateway/cmd/httpbench`: passed.
- `npm run bench:identity-http:pgbouncer -- --concurrency 320 --operations 640 --out reports/identity-http-benchmark.current.json --timeout 300s --startup-timeout-ms 180000`: passed.
- `npm run bench:identity-http:pgbouncer -- --concurrency 360 --operations 720 --out reports/identity-http-benchmark.concurrency360.json --timeout 300s --startup-timeout-ms 180000`: failed and wrote a structured `FAILED` report.
- `npm run audit:performance-evidence`: passed, readiness `READY`.

## Next Optimization Target

Do not claim ultra-high concurrency yet. The next slice should tune the
identity-only runtime profile toward the current PgBouncer performance profile,
then rerun the 320/360/512 probes under the same evidence contract. If 360
still fails after that, the next bottleneck is likely the single local gateway
accept/connect path, and the right test is a multi-worker or load-balanced
gateway profile rather than only increasing database pools.
