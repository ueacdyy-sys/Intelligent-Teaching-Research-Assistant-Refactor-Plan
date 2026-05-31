# P27 Identity Write Limiter Benchmark Summary

## Summary

Added an aggregate `gatewayWriteLimiterDiagnostics` summary to Identity HTTP
benchmark reports and used it in a fresh 4400-concurrency Docker probe.

The new evidence confirms the earlier suspicion from P25: the optional write
limiter reduces pgx pool wait, but most of that pressure moves into the
application write-slot queue. `SESSION_DB_WRITE_CONCURRENCY` remains disabled by
default.

## SDD

`docs/sdd/0108-identity-write-limiter-benchmark-summary.md`

This slice intentionally keeps:

- no public Identity HTTP contract changes,
- no token or session semantic changes,
- no PostgreSQL, PgBouncer, gateway DB pool, or ingress limit increase,
- no default write-limiter enablement,
- no model, training, OCR, RAG, vector DB, or embedding dependency.

## Red Test

Command:

`node --test tools/identity-gateway-diagnostics-summary.test.mjs`

Result before implementation: failed as expected because
`gatewayWriteLimiterDiagnostics` was missing from successful and failed
benchmark reports.

## Implementation

- Added `tools/identity-gateway-diagnostics-summary.mjs`.
- Added aggregate limiter snapshots for benchmark reports:
  - gateways with limiter stats,
  - enabled gateways,
  - configured limit total,
  - current slots in use and waiters,
  - cumulative acquire count,
  - cumulative acquire wait time,
  - canceled acquire count and wait time.
- Added before/after deltas for cumulative limiter counters.
- Preserved raw `gatewayDatabaseDiagnostics`.
- Omitted the summary for older diagnostics without `stats.writeLimiter`.

## Focused Verification

Command:

`node --test tools/identity-gateway-diagnostics-summary.test.mjs tools/run-identity-http-benchmark.test.mjs`

Result: passed, 4 tests.

## Benchmark Commands

Pre-run maintenance:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.pre-4400-client200-write-concurrency10-summary-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum full --timeout 300s`

Benchmark:

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --session-db-write-concurrency 10 --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 2400 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-write10-client200-write-limiter-summary-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000`

Post-run maintenance:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.post-4400-client200-write-concurrency10-summary-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum none --timeout 300s`

## Benchmark Result

Report:

`reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-write10-client200-write-limiter-summary-ingress19080-clean-table-docker-bench.json`

| Metric | Insert-only baseline | Prior write10 | New write10 summary |
| --- | ---: | ---: | ---: |
| Status | PASSED | PASSED | PASSED |
| Total duration | 222742.75ms | 231647.48ms | 228426.26ms |
| Delta vs insert-only | 0ms | +8904.73ms | +5683.51ms |
| Login P95 | 1573.89ms | 1379.69ms | 1673.47ms |
| Read P95 | 1172.88ms | 1036.12ms | 1115.06ms |
| Refresh P95 | 1305.65ms | 1202.66ms | 1227.53ms |
| Revoke P95 | 2659.94ms | 2788.92ms | 2796.50ms |
| Revoke P99 | 3121.35ms | 3128.61ms | 2959.12ms |
| Revoked lookup P95 | 948.49ms | 242.89ms | 213.23ms |
| DB pool acquire wait | 25302474.37ms | 1423349.02ms | 1688071.69ms |
| DB pool empty acquire count | 51814 | 25070 | 25465 |
| Limiter acquire wait | n/a | n/a | 23014553.04ms |
| Limiter acquire count | n/a | n/a | 70400 |

PostgreSQL timeline summary for the new run:

- `ClientRead`: summed connections 5888
- active/no wait event: summed connections 168
- `WALWrite`: summed connections 43
- `WalSync`: summed connections 22

PgBouncer after-snapshot:

- application `cl_waiting=0`
- application `sv_idle=48`

## Interpretation

The limiter is doing exactly what it was designed to do as a diagnostic control:
it sharply reduces pgx pool acquisition wait. But the new summary proves that
the removed pool wait is mostly replaced by application write-slot waiting:

- DB pool wait reduced by about 23614 seconds versus insert-only.
- Write limiter accumulated about 23015 seconds of acquire wait.
- Total duration still regressed by 5683.51ms versus insert-only.

So the current system supports the 4400 logical-concurrency profile, but not a
strong claim that this write limiter makes mixed read/write throughput better.
The limiter can remain useful for read-tail protection or diagnostic shaping,
but it must not be promoted as the default.

Next optimization should reduce write pressure itself: refresh/revoke write
amplification, WAL durability pressure, or token/session state mutation shape.
Blindly increasing gateway pools or enabling the limiter by default is not
supported by the evidence.
