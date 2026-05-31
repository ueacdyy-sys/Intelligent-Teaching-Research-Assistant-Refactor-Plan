# P19 Identity Gateway DB Pool Diagnostics

## Summary

Added SDD 0100 and internal DB pool diagnostics for the Identity gateway. The
benchmark runner now samples each direct gateway before and after a run and
rejects ingress/gateway port overlap before spawning any process.

The diagnostics found that the previous `--ingress-port 18080
--ingress-count 22` profile overlaps the direct gateway ports `18100` and
`18101`. That means the last two "ingress" targets could be satisfied by
already-running gateway listeners, so future 22-ingress evidence must use a
non-overlapping port range.

## Red Tests

Focused tests before implementation:

`go test ./services/identity-access-gateway/internal/adapter/httpapi -run TestSessionDBPoolDiagnostics -count=1`

Result: failed because the platform diagnostics DTO, server config, and
internal diagnostics endpoint did not exist.

`node --test tools/run-identity-http-benchmark.test.mjs`

Result: failed because benchmark reports did not attach gateway DB diagnostics
and the runner did not reject ingress/gateway port overlap.

## Implementation

- Added `platform.SessionDBPoolStats` and
  `platform.SessionDBPoolStatsProvider`.
- Added `GET /internal/identity/session-db-pool`, gated by
  `X-Internal-Diagnostics-Secret`.
- Wired Postgres-backed gateways to expose `pgxpool.Stat()` counters.
- Kept memory-backed gateways with the diagnostics endpoint disabled.
- Taught the benchmark runner to attach
  `gatewayDatabaseDiagnostics.before/after` to success and failure reports.
- Taught the runner to reject overlapping ingress and gateway ports before
  spawning gateway or ingress processes.

No public Identity OpenAPI contract, token semantics, runtime model/training
dependency, OCR dependency, RAG dependency, embedding dependency, or vector
database dependency was introduced.

## Focused Verification

`go test ./services/identity-access-gateway/internal/adapter/httpapi -run TestSessionDBPoolDiagnostics -count=1 -v`

Result: passed.

`node --test tools/run-identity-http-benchmark.test.mjs`

Result: passed.

## Port Overlap Finding

Rejected profile:

`--base-url http://127.0.0.1:18100 --gateway-count 6 --ingress-proxy true --ingress-port 18080 --ingress-count 22`

Overlap:

| Gateway ports | Ingress ports | Overlap |
| --- | --- | --- |
| 18100-18105 | 18080-18101 | 18100, 18101 |

The runner now fails this profile with:

`identity HTTP benchmark ingress/gateway port overlap: 18100, 18101. Choose --ingress-port outside the gateway port range.`

## Valid Non-Overlapping Probe

Pre-probe maintenance:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.pre-4400-client200-db-pool-diagnostics-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum none`

Result: 0 rows, 0 active rows, table size 0 B.

Benchmark:

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-db-pool-diagnostics-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000`

Result: passed with zero phase errors.

| Phase | P95 | P99 | RPS | Errors |
| --- | ---: | ---: | ---: | ---: |
| passwordLogin | 1314.15ms | 1510.53ms | 4563.52 | 0 |
| principalLookup | 1102.16ms | 1170.73ms | 4470.08 | 0 |
| refreshRotation | 1154.20ms | 1272.81ms | 4165.67 | 0 |
| revokeCycle | 2877.49ms | 3008.10ms | 1661.93 | 0 |

Revoke-cycle step profile:

| Step | P95 | P99 |
| --- | ---: | ---: |
| login | 1106.40ms | 1230.90ms |
| revoke | 1169.15ms | 1278.34ms |
| revokedPrincipalLookup | 994.88ms | 1158.28ms |

Gateway DB pool after-snapshot:

| Metric | Observation |
| --- | ---: |
| gateway workers | 6 |
| max conns per gateway | 12 |
| total gateway DB client budget | 72 |
| total acquire count | 88042 |
| total empty acquire count | 51849 |
| average acquire wait range | 273.08-277.31ms |
| average empty acquire wait range | 463.85-470.59ms |

## Pool14 Comparison

Pre-probe maintenance:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.pre-4400-client200-pool14-db-pool-diagnostics-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum full --timeout 300s`

Result: 0 rows; `VACUUM FULL` reduced total relation size from 6.8 MB to 40 KB.

Benchmark:

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 14 --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool14-client200-db-pool-diagnostics-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000`

Result: passed with zero phase errors, but latency got worse.

| Metric | Pool12 non-overlap | Pool14 non-overlap | Change |
| --- | ---: | ---: | ---: |
| passwordLogin P95 | 1314.15ms | 1282.30ms | -31.85ms |
| principalLookup P95 | 1102.16ms | 1097.30ms | -4.86ms |
| refreshRotation P95 | 1154.20ms | 1241.84ms | +87.64ms |
| revokeCycle P95 | 2877.49ms | 3047.91ms | +170.42ms |
| revokeCycle P99 | 3008.10ms | 3427.66ms | +419.56ms |
| average acquire wait range | 273.08-277.31ms | 292.00-301.36ms | worse |
| average empty acquire wait range | 463.85-470.59ms | 496.36-511.14ms | worse |

## Interpretation

The valid non-overlapping 4400 run materially improves tail latency compared
with the older overlapping-port client-200 evidence:

| Metric | Older client-200 | Non-overlap pool12 | Change |
| --- | ---: | ---: | ---: |
| passwordLogin P95 | 1819.11ms | 1314.15ms | -504.96ms |
| principalLookup P95 | 1123.04ms | 1102.16ms | -20.88ms |
| refreshRotation P95 | 1216.89ms | 1154.20ms | -62.69ms |
| revokeCycle P95 | 3042.92ms | 2877.49ms | -165.43ms |
| revokeCycle P99 | 3794.21ms | 3008.10ms | -786.11ms |

This does not mean the system is ready to claim ultra-high concurrency. It
means the earlier 22-ingress configuration was partly polluted by port overlap,
and the corrected profile is a stronger 4400 pass point.

The DB pool diagnostics show real gateway-side connection waiting under 4400
load, but increasing each gateway pool from 12 to 14 worsened the mixed
read/write tail. The current performance recommendation is therefore:

- keep the corrected non-overlapping ingress port plan,
- keep six gateway workers with `SESSION_DB_MAX_CONNS=12` for the current 4400
  profile,
- do not raise gateway DB pools blindly,
- next inspect PgBouncer server-pool wait and PostgreSQL scheduling before
  changing pool limits again.

## Post-Probe Maintenance

Pool12 post-probe maintenance:

`reports/identity-session-maintenance.post-4400-client200-db-pool-diagnostics-ingress19080.json`

Result: 0 rows, 0 active rows. The table had 0 live rows but retained 7 MB of
table storage before vacuum.

Pool14 post-probe maintenance:

`reports/identity-session-maintenance.post-4400-client200-pool14-db-pool-diagnostics-ingress19080.json`

Result: 0 rows, 0 active rows, total relation size 3.5 MB.

## Verification

- Focused HTTP adapter diagnostics tests passed.
- Focused benchmark runner tests passed.
- Dockerized 4400 non-overlap pool12 probe passed with zero errors.
- Dockerized 4400 non-overlap pool14 comparison passed with zero errors but
  worse tail latency.
