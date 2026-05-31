# P20 Identity PgBouncer Scheduling Diagnostics

## Summary

Added SDD 0101 and optional PgBouncer diagnostics to the Identity HTTP
benchmark runner. The runner can now capture `SHOW STATS`, `SHOW POOLS`, and
`SHOW CONFIG` snapshots before and after a Docker-backed high-concurrency run.

The corrected 4400-concurrency, non-overlapping ingress, pool12 profile still
passed with zero phase errors. PgBouncer after-snapshot did not show queued
clients, while every gateway still reported DB pool acquisition waiting. This
keeps the current recommendation conservative: do not raise gateway DB pools
blindly; collect deeper PostgreSQL and time-series scheduling evidence before
claiming a broader ultra-high-concurrency ceiling.

## SDD

`docs/sdd/0101-identity-pgbouncer-scheduling-diagnostics.md`

The slice is intentionally diagnostic:

- no public Identity HTTP contract changes,
- no token or session semantic changes,
- no model, training, OCR, RAG, vector DB, or embedding dependency,
- no default Docker requirement for `npm test`,
- no PgBouncer or PostgreSQL limit increase.

## Focused Verification

Focused runner test after implementation:

`node --test tools/run-identity-http-benchmark.test.mjs`

Result: passed.

The focused tests cover:

- failure reports attach PgBouncer diagnostics when present,
- success reports attach PgBouncer diagnostics when present,
- `psql -A -F "|"` output parses into typed row objects,
- Docker `psql` diagnostics use `PGPASSWORD=ueacd`,
- collected diagnostics do not leak `ueacd`.

## Docker Smoke Probe

Command:

`node tools/run-identity-http-benchmark.mjs --pgbouncer-diagnostics true --concurrency 4 --operations 8 --session-db-max-conns 2 --out tmp/identity-pgbouncer-diagnostics-smoke.json --timeout 120s --startup-timeout-ms 120000`

Result: passed and wrote both `gatewayDatabaseDiagnostics` and
`pgbouncerDiagnostics.before/after`. The temporary smoke report was removed.

## Pre-Probe Maintenance

Command:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.pre-4400-client200-pgbouncer-diagnostics-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum full --timeout 300s`

Result: 0 rows, 0 active rows. `VACUUM FULL` reduced total relation size from
3.6 MB to 40 KB.

## Benchmark

Command:

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --pgbouncer-diagnostics true --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-pgbouncer-diagnostics-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000`

Result: passed with zero phase errors.

| Phase | P95 | P99 | Errors |
| --- | ---: | ---: | ---: |
| passwordLogin | 1661.22ms | 2027.47ms | 0 |
| principalLookup | 1161.12ms | 1241.95ms | 0 |
| refreshRotation | 1272.17ms | 1393.90ms | 0 |
| revokeCycle | 2767.06ms | 3248.84ms | 0 |

Revoke-cycle step profile:

| Step | P95 | P99 |
| --- | ---: | ---: |
| login | 961.10ms | 1622.37ms |
| revoke | 1044.27ms | 1080.75ms |
| revokedPrincipalLookup | 993.64ms | 1074.22ms |

## PgBouncer Snapshot

After-snapshot pool row for `intelligent_teaching_assistant`:

| Metric | Value |
| --- | ---: |
| cl_active | 72 |
| cl_waiting | 0 |
| sv_active | 0 |
| sv_idle | 48 |
| sv_used | 0 |
| maxwait | 0 |
| pool_mode | transaction |

PgBouncer stats delta across the benchmark:

| Metric | Delta |
| --- | ---: |
| total_server_assignment_count | 88513 |
| total_xact_count | 88513 |
| total_query_count | 88513 |
| total_wait_time | 42646137 |
| total_query_time | 521011137 |
| total_received | 37634499 |
| total_sent | 14808418 |

Relevant PgBouncer config:

| Setting | Value |
| --- | ---: |
| pool_mode | transaction |
| max_client_conn | 2000 |
| max_db_connections | 90 |
| default_pool_size | 48 |
| reserve_pool_size | 16 |
| query_wait_timeout | 30 |
| reserve_pool_timeout | 3 |
| listen_backlog | 128 |

## Gateway DB Pool Snapshot

Gateway DB pool after-snapshot:

| Metric | Observation |
| --- | ---: |
| gateway workers | 6 |
| max conns per gateway | 12 |
| total gateway DB client budget | 72 |
| total acquire count | 88042 |
| total empty acquire count | 52012 |
| average acquire wait range | 289.45-301.37ms |
| average empty acquire wait range | 488.51-510.46ms |

## Interpretation

This run strengthens the 4400 pass evidence because it combines:

- corrected non-overlapping ingress ports,
- client transport capacity equal to 4400 logical concurrency,
- six gateway workers,
- gateway DB pool diagnostics,
- PgBouncer admin diagnostics,
- clean-table pre-maintenance,
- zero phase errors.

It does not prove the system supports arbitrary ultra-high concurrency. The
remaining write-path tail is still large, especially `revokeCycle` P95/P99, and
PgBouncer snapshots alone are not a time-series trace. The after-snapshot
showed no queued PgBouncer clients, but gateway pools still spent meaningful
time waiting for connections. The likely next bottleneck is the combined
gateway connection budget, transaction duration under mixed write load, and
local Docker/PostgreSQL scheduling under pressure.

Current recommendation:

- keep six gateway workers with `SESSION_DB_MAX_CONNS=12` for the current 4400
  evidence point,
- keep ingress ports outside the direct gateway port range,
- keep PgBouncer `max_db_connections=90` for this profile,
- do not promote pool14 because SDD 0100 recorded worse tail latency,
- next collect PostgreSQL activity/wait snapshots or time-series PgBouncer
  samples during the benchmark before changing pool limits again.

## Post-Probe Maintenance

Command:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.post-4400-client200-pgbouncer-diagnostics-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum none`

Result: 0 rows, 0 active rows, total relation size 4.7 MB.
