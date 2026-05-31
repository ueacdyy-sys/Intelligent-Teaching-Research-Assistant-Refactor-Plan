# P24 Identity Session Insert-Only Save

## Summary

Changed the PostgreSQL Identity session write path from generated-session-ID
upsert to insert-only save. The public Identity HTTP contract is unchanged.

This is a small write-path optimization and a correctness tightening: production
session IDs are random generated values, so a duplicate ID should fail through
the primary key instead of overwriting an existing session.

The repeat 4400 logical-concurrency benchmark passed with zero phase errors.
Compared with the SDD 0104 PostgreSQL wait-timeline baseline, total benchmark
duration improved by 4066.78ms and revoke-cycle P95 improved by 147.59ms.
Revoke-cycle P99 regressed by 202.83ms, so the result supports keeping the
change but does not justify a broader "ultra-high concurrency" claim.

## SDD

`docs/sdd/0105-identity-session-insert-only-save.md`

This slice intentionally keeps:

- no public API shape changes,
- no token generation changes,
- no PostgreSQL, PgBouncer, gateway DB pool, or ingress limit increase,
- no cache introduction,
- no model, training, OCR, RAG, vector DB, or embedding dependency.

## Red Test

Command:

`go test ./services/identity-access-gateway/internal/adapter/postgres -run "TestSessionStoreSaveSessionUsesInsertOnlySessionIDs|TestSessionStoreSaveSessionRejectsDuplicateSessionID" -count=1`

Result before implementation: failed as expected.

Failures:

- `SaveSession` still contained `ON CONFLICT`.
- The fake PostgreSQL adapter accepted a duplicate generated `session_id`.

## Implementation

- Removed `ON CONFLICT (session_id) DO UPDATE` from PostgreSQL `SaveSession`.
- Made the PostgreSQL adapter test double reject duplicate `session_id` writes.
- Added adapter tests for insert-only SQL and duplicate-session preservation.
- Made the no-database memory fallback reject duplicate generated `session_id`
  writes so local fallback behavior matches the PostgreSQL adapter.

## Verification

Commands:

- `go test ./services/identity-access-gateway/internal/adapter/postgres -run "TestSessionStoreSaveSessionUsesInsertOnlySessionIDs|TestSessionStoreSaveSessionRejectsDuplicateSessionID" -count=1`
- `go test ./services/identity-access-gateway/internal/usecase -run TestCreatePasswordSessionRejectsDuplicateGeneratedSessionID -count=1`
- `go test ./services/identity-access-gateway/internal/adapter/postgres -count=1`
- `go test ./services/identity-access-gateway/... -count=1`
- `npm run audit:performance-evidence`
- `npm run quality`

Results:

- Focused red/green adapter tests passed after implementation.
- Focused red/green use-case test passed after aligning the memory fallback.
- PostgreSQL adapter tests passed.
- Full Identity gateway Go tests passed.
- Performance evidence registry audit returned READY.
- Strict quality gate passed all 19 command gates.

## Pre-Probe Maintenance

Command:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.pre-4400-client200-insert-only-save-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum full --timeout 300s`

Result: passed. The table was already clean with 0 rows. `VACUUM FULL` reduced
the relation footprint from 4.8 MB to 40 KB.

## Benchmark

Command:

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 2400 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-insert-only-save-postgres-wait-timeline-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000`

Result: passed with zero phase errors.

| Metric | Value |
| --- | ---: |
| logical concurrency | 4400 |
| operations per phase | 8800 |
| total duration | 222742.75ms |
| total duration delta vs SDD 0104 | -4066.78ms |
| gateway workers | 6 |
| ingress listeners | 22 |
| gateway DB pool budget | 72 |
| phase errors | 0 |

## Phase Latency

Compared with the SDD 0104 PostgreSQL wait-timeline baseline.

| Phase | Baseline P95 | Insert-only P95 | Delta | Baseline P99 | Insert-only P99 | Delta | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| passwordLogin | 1567.77ms | 1573.89ms | +6.12ms | 1696.72ms | 1743.43ms | +46.71ms | 0 |
| principalLookup | 1134.75ms | 1172.88ms | +38.13ms | 1284.42ms | 1291.33ms | +6.91ms | 0 |
| refreshRotation | 1305.32ms | 1305.65ms | +0.33ms | 1445.75ms | 1422.58ms | -23.17ms | 0 |
| revokeCycle | 2807.53ms | 2659.94ms | -147.59ms | 2918.52ms | 3121.35ms | +202.83ms | 0 |

## Revoke-Cycle Step Latency

| Step | Baseline P95 | Insert-only P95 | Delta | Baseline P99 | Insert-only P99 | Delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| login | 1056.69ms | 928.19ms | -128.50ms | 1157.19ms | 1492.83ms | +335.64ms |
| revoke | 1148.41ms | 997.92ms | -150.49ms | 1253.58ms | 1053.13ms | -200.45ms |
| revokedPrincipalLookup | 960.16ms | 948.49ms | -11.67ms | 1075.80ms | 998.52ms | -77.28ms |

## PostgreSQL Timeline

| Metric | Value |
| --- | ---: |
| status | OK |
| interval | 1000ms |
| samples | 131 |
| max PostgreSQL backends | 49 |
| max ungranted locks | 0 |

Top PostgreSQL activity aggregates across sampled rows:

| Activity | Summed connections |
| --- | ---: |
| `idle|Client|ClientRead` | 5717 |
| `active||` | 138 |
| `active|LWLock|WALWrite` | 46 |
| `active|IO|WalSync` | 20 |
| `idle||` | 16 |
| `idle|IO|WalSync` | 5 |

## Gateway DB Pool Snapshot

| Metric | Value |
| --- | ---: |
| gateway workers | 6 |
| max conns per gateway | 12 |
| total gateway DB client budget | 72 |
| total empty acquire count | 51814 |
| max average acquire wait | 292.71ms |
| max average empty-acquire wait | 498.36ms |
| idle conns after run | 12 per gateway |
| total conns after run | 12 per gateway |

## PgBouncer Snapshot

After pool row for `intelligent_teaching_assistant`:

| Metric | Value |
| --- | ---: |
| cl_active | 72 |
| cl_waiting | 0 |
| sv_active | 0 |
| sv_idle | 48 |
| maxwait | 0 |

PgBouncer stats delta across the benchmark:

| Metric | Delta |
| --- | ---: |
| total_xact_count | 88520 |
| total_query_count | 88520 |
| total_wait_time | 42209206 |
| total_query_time | 508000734 |

## Interpretation

The insert-only session save is worth keeping because it removes unnecessary
hot-path upsert work and prevents accidental overwrite on generated session ID
collision. The strongest latency improvement appears inside revoke-cycle steps:
revoke P95 improved by 150.49ms and revoke P99 improved by 200.45ms.

The result is not a clean universal win. Password-login P99 and total
revoke-cycle P99 were worse in this run, which means the remaining bottleneck is
still tail scheduling and WAL/write pressure rather than a single SQL clause.

Current recommendation:

- keep insert-only `SaveSession`;
- keep six gateway workers for the current 4400 evidence profile;
- keep `SESSION_DB_MAX_CONNS=12`;
- keep PgBouncer `max_db_connections=90`;
- do not claim whole-system ultra-high concurrency beyond measured slices;
- next optimize the remaining refresh/revoke write scheduling or WAL pressure
  with the same evidence loop.

## Post-Probe Maintenance

Command:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.post-4400-client200-insert-only-save-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum none --timeout 300s`

Result: passed. The table was clean with 0 rows after the benchmark. Total
relation size after the run was 4.6 MB.
