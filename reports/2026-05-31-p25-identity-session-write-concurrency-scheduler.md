# P25 Identity Session Write Concurrency Scheduler

## Summary

Added an optional per-gateway Identity PostgreSQL write scheduler behind
`SESSION_DB_WRITE_CONCURRENCY`. The default remains `0`, which means disabled.

The scheduler is not a throughput win for the current 4400 logical-concurrency
mixed workload. It sharply reduces gateway DB pool acquisition wait and improves
login, principal lookup, and refresh tail latency, but the best shaped value
tested still regresses total duration versus the SDD 0105 insert-only baseline.

Current recommendation:

- keep `SESSION_DB_WRITE_CONCURRENCY=0` as the default;
- keep `SESSION_DB_MAX_CONNS=12` for the measured 4400 profile;
- keep PgBouncer `max_db_connections=90`;
- use `SESSION_DB_WRITE_CONCURRENCY=10` only as an explicit read-tail
  protection profile or diagnostic probe;
- add write-limiter wait telemetry before any future default promotion.

## SDD

`docs/sdd/0106-identity-session-write-concurrency-scheduler.md`

This slice intentionally keeps:

- no public Identity HTTP contract changes,
- no token or session semantic changes,
- no PostgreSQL, PgBouncer, gateway DB pool, or ingress limit increase,
- no Redis, cache, queue, model, training, OCR, RAG, vector DB, or embedding
  dependency.

## Red Tests

Commands:

- `go test ./services/identity-access-gateway/internal/adapter/postgres -run TestSessionStoreWriteConcurrencyLimitsOverlappingWrites -count=1`
- `node --test tools/run-identity-http-benchmark.test.mjs`

Result before implementation: failed as expected.

Failures:

- `NewSessionStoreWithConfig` and `SessionStoreConfig` did not exist.
- `--session-db-write-concurrency` was not parsed or reported by the benchmark
  runner.

## Implementation

- Added `SessionStoreConfig{WriteConcurrency int}` and
  `NewSessionStoreWithConfig`.
- Added a channel-backed write limiter inside the PostgreSQL session store.
- Wrapped session and remote-command write paths in the limiter.
- Left access-token and refresh-token principal reads outside the limiter.
- Added `SESSION_DB_WRITE_CONCURRENCY`, default `0`, to the gateway runtime.
- Passed the setting through the HTTP benchmark runner and report profile.

## Verification

Commands:

- `go test ./services/identity-access-gateway/internal/adapter/postgres -run TestSessionStoreWriteConcurrencyLimitsOverlappingWrites -count=1`
- `node --test tools/run-identity-http-benchmark.test.mjs`
- `go test ./services/identity-access-gateway/... -count=1`
- `npm run audit:performance-evidence`
- `npm run quality`

Results:

- Focused adapter test passed after implementation.
- Focused benchmark-runner test passed after implementation.
- Full Identity gateway Go tests passed.
- Performance evidence registry audit returned READY before benchmark
  registration.
- Strict quality gate passed all 19 command gates before Docker probes.

## Benchmark Profile

Both probes used the same 4400 logical-concurrency profile:

- six host Go gateways,
- 22 non-overlapping ingress listeners,
- `SESSION_DB_MAX_CONNS=12`,
- PgBouncer transaction pooling,
- PostgreSQL wait timeline diagnostics at 1000ms interval,
- Dockerized Go load generator,
- 8800 operations per phase,
- warmed client transport with 200 max and warm connections per ingress host.

## Pre-Probe Maintenance

Commands:

- `npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.pre-4400-client200-write-concurrency8-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum full --timeout 300s`
- `npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.pre-4400-client200-write-concurrency10-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum full --timeout 300s`

Results:

- write8 pre-run: table was clean with 0 rows; `VACUUM FULL` reduced relation
  footprint from 4.7 MB to 40 KB.
- write10 pre-run: table was clean with 0 rows; `VACUUM FULL` reduced relation
  footprint from 4.8 MB to 40 KB.

## Benchmarks

Commands:

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --session-db-write-concurrency 8 --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 2400 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-write8-client200-postgres-wait-timeline-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000`

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --session-db-write-concurrency 10 --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 2400 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-write10-client200-postgres-wait-timeline-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000`

Results: both passed with zero phase errors.

## Headline Comparison

Compared with the SDD 0105 insert-only baseline.

| Profile | Total duration | Delta | Write slots total | Phase errors |
| --- | ---: | ---: | ---: | ---: |
| insert-only baseline | 222742.75ms | 0ms | disabled | 0 |
| writeConcurrency=8 | 239670.01ms | +16927.26ms | 48 | 0 |
| writeConcurrency=10 | 231647.48ms | +8904.73ms | 60 | 0 |

## Phase P95

| Phase | Insert-only | write8 | Delta | write10 | Delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| passwordLogin | 1573.89ms | 1442.49ms | -131.40ms | 1379.69ms | -194.20ms |
| principalLookup | 1172.88ms | 1069.34ms | -103.54ms | 1036.12ms | -136.76ms |
| refreshRotation | 1305.65ms | 1192.94ms | -112.71ms | 1202.66ms | -102.99ms |
| revokeCycle | 2659.94ms | 2852.24ms | +192.30ms | 2788.92ms | +128.98ms |

## Phase P99

| Phase | Insert-only | write8 | Delta | write10 | Delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| passwordLogin | 1743.43ms | 1775.04ms | +31.61ms | 1571.53ms | -171.90ms |
| principalLookup | 1291.33ms | 1133.67ms | -157.66ms | 1110.58ms | -180.75ms |
| refreshRotation | 1422.58ms | 1316.43ms | -106.15ms | 1343.89ms | -78.69ms |
| revokeCycle | 3121.35ms | 3048.92ms | -72.43ms | 3128.61ms | +7.26ms |

## Gateway DB Pool Evidence

| Profile | Total acquire duration | Empty acquire count |
| --- | ---: | ---: |
| insert-only baseline | 25302474.37ms | 51814 |
| writeConcurrency=8 | 1510949.51ms | 21097 |
| writeConcurrency=10 | 1423349.02ms | 25070 |

The scheduler does what it was designed to do: gateway DB pool waits collapse.
The problem is that the wait moves into the application write queue, which is
not currently reported as first-class telemetry. That hidden queue explains why
lower DB pool wait did not become better total mixed-workload throughput.

## PostgreSQL Timeline

| Profile | Samples | WALWrite summed connections | WalSync summed connections | Max ungranted locks |
| --- | ---: | ---: | ---: | ---: |
| insert-only baseline | 131 | 46 | 20 | 0 |
| writeConcurrency=8 | 138 | 27 | 29 | 0 |
| writeConcurrency=10 | 134 | 29 | 27 | 0 |

The PostgreSQL timeline still points to write durability pressure and does not
show lock contention. PgBouncer after-snapshots still showed no application
client queueing.

## Post-Probe Maintenance

Commands:

- `npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.post-4400-client200-write-concurrency8-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum none --timeout 300s`
- `npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.post-4400-client200-write-concurrency10-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum none --timeout 300s`

Results:

- Both post-run snapshots found 0 remaining rows.
- Relation size after the write8 run was 4.8 MB.
- Relation size after the write10 run was 4.7 MB.

## Interpretation

`writeConcurrency=8` is a negative throughput probe. It improves some read and
refresh tails, but total duration and revoke-cycle P95 regress too much.

`writeConcurrency=10` is the better shaped-write profile. It materially improves
login, read, and refresh tails while keeping zero errors, but total duration
still regresses by 8904.73ms versus the insert-only baseline and revoke-cycle
P95 remains worse.

So this slice should land as a reversible configuration and diagnostic lever,
not as a default performance optimization. The current measured throughput
ceiling for this Identity slice remains the insert-only pool12 4400 profile.
The next optimization should instrument write-limiter wait time and then reduce
write amplification or WAL pressure, rather than increasing connection fan-out
or blindly enabling the limiter.
