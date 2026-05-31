# P21 Identity Column-Backed Session Timestamps

## Summary

Added SDD 0102 and moved Identity session timestamp reads to the dedicated
`issued_at` and `expires_at` columns. `principal_json` remains part of the
durable session row, but refresh rotation and fallback rotation no longer
rewrite JSONB just to mirror timestamp fields.

The public Identity HTTP contract and the `identity_sessions` table shape are
unchanged. This is a bounded adapter optimization inside the Identity session
store, aimed at reducing write amplification on the high-concurrency refresh
path.

## SDD

`docs/sdd/0102-identity-session-column-backed-timestamps.md`

The slice intentionally keeps:

- no public API shape changes,
- no table rewrite,
- no cache introduction,
- no model, training, OCR, RAG, vector DB, or embedding dependency,
- no PgBouncer or PostgreSQL limit increase.

## Code Change

- `GetPrincipalByAccessToken` and `GetPrincipalByRefreshToken` now scan
  `principal_json, issued_at, expires_at` and reconstruct returned timestamps
  from scalar columns.
- `RotateRefreshSession` updates token and scalar timestamp columns, returns
  the stored columns, and avoids `jsonb_set` on `principal_json`.
- `RotateSession` updates token and scalar timestamp columns without rewriting
  `principal_json`, and keeps the same atomic expiry guard as the fast refresh
  path.
- Adapter fake DB tests now model scalar session timestamps separately from
  `principal_json`.

## Focused Verification

Focused Go adapter tests:

`go test ./services/identity-access-gateway/...`

Focused benchmark runner tests:

`node --test tools/run-identity-http-benchmark.test.mjs`

Performance evidence registry audit:

`npm run audit:performance-evidence`

Result: READY with 32 registered evidence entries, including the new
timestamp-column-backed 4400 report.

## Pre-Probe Maintenance

Command:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.pre-4400-client200-timestamp-column-backed-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum full --timeout 300s`

Result: 0 rows, 0 active rows. `VACUUM FULL` reduced total relation size from
4.7 MB to 40 KB.

## Benchmark

Command:

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --pgbouncer-diagnostics true --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-timestamp-column-backed-pgbouncer-diagnostics-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000`

Result: passed with zero phase errors.

| Phase | Previous P95 | Current P95 | Delta | Previous P99 | Current P99 | Delta | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| passwordLogin | 1661.22ms | 1741.64ms | +80.42ms | 2027.47ms | 1898.16ms | -129.31ms | 0 |
| principalLookup | 1161.12ms | 1113.39ms | -47.73ms | 1241.95ms | 1209.27ms | -32.68ms | 0 |
| refreshRotation | 1272.17ms | 1080.11ms | -192.06ms | 1393.90ms | 1228.20ms | -165.70ms | 0 |
| revokeCycle | 2767.06ms | 2747.40ms | -19.66ms | 3248.84ms | 2858.40ms | -390.44ms | 0 |

Revoke-cycle step profile:

| Step | P95 | P99 |
| --- | ---: | ---: |
| login | 967.72ms | 1063.28ms |
| revoke | 1061.52ms | 1145.97ms |
| revokedPrincipalLookup | 1069.15ms | 1244.83ms |

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
| total_server_assignment_count | 88512 |
| total_xact_count | 88512 |
| total_query_count | 88512 |
| total_wait_time | 49153237 |
| total_query_time | 517480217 |
| total_received | 37135130 |
| total_sent | 16743417 |

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
| total empty acquire count | 51939 |
| average acquire wait range | 289.78-301.66ms |
| average empty acquire wait range | 488.55-512.97ms |

## Interpretation

The optimization is directionally useful but not a full concurrency-ceiling
breakthrough. It improved the intended refresh-rotation hot path materially
without changing public contracts. It also improved principal lookup tail
latency and revoke-cycle P99, which is consistent with removing JSONB timestamp
mutation from a mixed write-heavy benchmark.

The remaining bottleneck is still not PgBouncer queueing at the after-snapshot:
`cl_waiting=0`, while gateway DB pools still show large empty-acquire wait
time. That keeps the next investigation focused on login and gateway-side DB
pool scheduling or PostgreSQL activity/wait time-series evidence, not blindly
raising PgBouncer or gateway pool limits.

Current recommendation:

- keep column-backed session timestamps,
- keep six gateway workers with `SESSION_DB_MAX_CONNS=12` for this 4400
  evidence profile,
- keep PgBouncer `max_db_connections=90`,
- do not claim arbitrary ultra-high concurrency from this run,
- next investigate login write path and gateway DB pool scheduling with
  time-series evidence.

## Post-Probe Maintenance

Command:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.post-4400-client200-timestamp-column-backed-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum none`

Result: 0 rows, 0 active rows, total relation size 15.8 MB and table size
11.1 MB after the benchmark.
