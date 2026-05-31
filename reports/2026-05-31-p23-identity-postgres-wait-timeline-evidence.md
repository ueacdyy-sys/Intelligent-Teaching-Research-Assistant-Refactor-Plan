# P23 Identity PostgreSQL Wait Timeline Evidence

## Summary

Registered the first 4400-concurrency Identity HTTP benchmark with PostgreSQL
wait timeline diagnostics enabled. The run passed with zero phase errors and
adds enough evidence to avoid guessing at the remaining bottleneck.

The key finding: the remaining tail is not explained by PostgreSQL lock
contention or an obvious PgBouncer after-run queue. The next optimization should
target write-path pressure and gateway-side DB scheduling, not higher pool
limits.

## SDD

`docs/sdd/0104-identity-postgres-wait-timeline-evidence.md`

This evidence slice intentionally keeps:

- no public API shape changes,
- no session or token semantic changes,
- no PostgreSQL, PgBouncer, gateway DB pool, or ingress limit increase,
- no cache introduction,
- no model, training, OCR, RAG, vector DB, or embedding dependency.

## Pre-Probe Maintenance

Command:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.pre-4400-client200-postgres-wait-timeline-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum full --timeout 300s`

Result: passed. The table was already clean with 0 rows. `VACUUM FULL` reduced
the relation footprint from 4.7 MB to 40 KB.

## Benchmark

Command:

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 2400 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-postgres-wait-timeline-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000`

Result: passed with zero phase errors.

| Metric | Value |
| --- | ---: |
| logical concurrency | 4400 |
| operations per phase | 8800 |
| total duration | 226809.53ms |
| gateway workers | 6 |
| ingress listeners | 22 |
| gateway DB pool budget | 72 |
| phase errors | 0 |

## Phase Latency

Compared with the previous column-backed timestamp evidence.

| Phase | Previous P95 | Current P95 | Delta | Previous P99 | Current P99 | Delta | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| passwordLogin | 1741.64ms | 1567.77ms | -173.87ms | 1898.16ms | 1696.72ms | -201.44ms | 0 |
| principalLookup | 1113.39ms | 1134.75ms | +21.36ms | 1209.27ms | 1284.42ms | +75.15ms | 0 |
| refreshRotation | 1080.11ms | 1305.32ms | +225.21ms | 1228.20ms | 1445.75ms | +217.55ms | 0 |
| revokeCycle | 2747.40ms | 2807.53ms | +60.13ms | 2858.40ms | 2918.52ms | +60.12ms | 0 |

## PostgreSQL Timeline

| Metric | Value |
| --- | ---: |
| status | OK |
| interval | 1000ms |
| samples | 132 |
| max PostgreSQL backends | 50 |
| max ungranted locks | 0 |

Top PostgreSQL activity aggregates across sampled rows:

| Activity | Summed connections |
| --- | ---: |
| `idle|Client|ClientRead` | 5784 |
| `active||` | 135 |
| `active|IO|WalSync` | 29 |
| `active|LWLock|WALWrite` | 25 |
| `active|Client|ClientRead` | 12 |

## Gateway DB Pool Snapshot

| Metric | Value |
| --- | ---: |
| gateway workers | 6 |
| max conns per gateway | 12 |
| total gateway DB client budget | 72 |
| total empty acquire count | 52181 |
| max average acquire wait | 313.52ms |
| max average empty acquire wait | 529.04ms |
| idle conns after run | 12 per gateway |
| total conns after run | 12 per gateway |

## PgBouncer Snapshot

Before and after pool rows for `intelligent_teaching_assistant`:

| Metric | Before | After |
| --- | ---: | ---: |
| cl_active | 6 | 72 |
| cl_waiting | 0 | 0 |
| sv_active | 0 | 0 |
| sv_idle | 1 | 48 |
| maxwait | 0 | 0 |

PgBouncer stats delta across the benchmark:

| Metric | Delta |
| --- | ---: |
| total_xact_count | 88513 |
| total_query_count | 88513 |
| total_wait_time | 45651262 |
| total_query_time | 529426940 |

## Interpretation

The benchmark still supports the current measured ceiling of 4400 logical
concurrency for this local Docker-backed Identity profile, but it does not
support a broad "ultra-high concurrency" claim for the whole system.

The strongest evidence is negative evidence:

- no ungranted PostgreSQL locks were sampled;
- PgBouncer did not show queued clients after the run;
- raising gateway DB pools to 14 was already a negative result;
- gateway DB acquisition waits remain high under pool12;
- PostgreSQL samples include WAL write and sync waits.

So the next useful optimization is not another pool increase. It should reduce
write amplification and scheduling pressure around login, refresh, and revoke.

Current recommendation:

- keep six gateway workers for the current 4400 evidence profile;
- keep `SESSION_DB_MAX_CONNS=12`;
- keep PgBouncer `max_db_connections=90`;
- keep the non-overlapping ingress profile;
- next inspect login inserts, revoke delete/lookup shape, and WAL-producing
  session writes.

## Post-Probe Maintenance

Command:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.post-4400-client200-postgres-wait-timeline-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum none --timeout 300s`

Result: passed. The table was clean with 0 rows after the benchmark. Total
relation size after the run was 4.8 MB.
