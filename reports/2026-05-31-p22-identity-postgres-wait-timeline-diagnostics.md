# P22 Identity PostgreSQL Wait Timeline Diagnostics

## Summary

Added SDD 0103 and an optional PostgreSQL diagnostics collector for the Identity
HTTP benchmark runner. This is not a pool-size change and does not claim a new
performance ceiling. It gives the next high-concurrency run stronger evidence
for the remaining read/write bottleneck by sampling PostgreSQL activity and
wait state while the benchmark is running.

## SDD

`docs/sdd/0103-identity-postgres-wait-timeline-diagnostics.md`

The slice keeps:

- no public API changes,
- no PostgreSQL or PgBouncer limit changes,
- no baseline model, training, OCR, RAG, vector, or embedding dependency,
- diagnostics disabled by default.

## Code Change

- Added `tools/identity-postgres-diagnostics.mjs`.
- Added optional benchmark flags:
  - `--postgres-diagnostics`
  - `--postgres-diagnostics-container`
  - `--postgres-diagnostics-host`
  - `--postgres-diagnostics-port`
  - `--postgres-diagnostics-user`
  - `--postgres-diagnostics-database`
  - `--postgres-diagnostics-interval-ms`
  - `--postgres-diagnostics-max-samples`
  - `--postgres-diagnostics-query-timeout-ms`
- Extended success and failure benchmark reports with optional
  `postgresDiagnostics.before`, `postgresDiagnostics.timeline`, and
  `postgresDiagnostics.after`.
- Kept the existing synchronous benchmark path for default runs; the asynchronous
  benchmark process is used only when PostgreSQL timeline diagnostics are
  enabled.

## Diagnostic Queries

The new collector samples:

- `pg_stat_activity` grouped by state, wait event type, and wait event,
- `pg_stat_database` counters for the current database,
- `pg_locks` grouped by lock mode and grant state.

The collector deliberately avoids selecting SQL text from `pg_stat_activity` so
benchmark reports do not persist request payloads or password-bearing statements.

## Verification

Focused tests:

`node --test tools/identity-postgres-diagnostics.test.mjs tools/run-identity-http-benchmark.test.mjs`

Result: passed.

Full project gates:

- `npm test`
- `npm run quality`

Result: passed. The first quality run caught an oversized runner file; the
diagnostic code was split into `tools/identity-postgres-diagnostics.mjs`, and
the final strict gate passed with the runner back under the 800-line limit.

## Next Performance Use

Re-run the current 4400 non-overlap benchmark with PostgreSQL diagnostics:

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-postgres-wait-timeline-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000`

That run should decide whether the next optimization targets login inserts,
gateway pool scheduling, PostgreSQL lock/wait behavior, or a runner-side
transport shape.
