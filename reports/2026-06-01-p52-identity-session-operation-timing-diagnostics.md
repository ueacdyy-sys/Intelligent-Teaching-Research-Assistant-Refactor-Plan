# P52 Identity Session Operation Timing Diagnostics

## Summary

This slice adds operation-level service-side timing to the Identity session
store and exposes it through the existing internal session DB diagnostics
endpoint.

The intent was to stop guessing why the 4400-concurrency Identity profile is
still slow on read/write paths. The new evidence shows that the dominant local
pressure is gateway-side pgx pool acquire queueing under high fanout, not
PostgreSQL execution saturation.

Decision: keep SDD 0152 and the diagnostics implementation, but do not promote a
new ultra-concurrency claim and do not make the pool20 or multi10 profiles the
default yet. They improve some phases and regress others.

## Code Changes

- Added `docs/sdd/0152-identity-session-operation-timing-diagnostics.md`.
- Added `sessionOperations` to `platform.SessionDBPoolStats`.
- Added `SessionOperationTimingStats()` to the PostgreSQL `SessionStore`.
- Recorded elapsed time around the database call for:
  - `saveSession`
  - `getPrincipalByAccessToken`
  - `getPrincipalByRefreshToken`
  - `rotateSession`
  - `rotateRefreshSession`
  - `revokeSession`
  - `revokeOwnSession`
  - `pruneInactiveSessions`
  - `acceptRemoteCommand`
- Merged the operation timing provider into `SessionDBStatsProvider`.
- Added focused tests for session-store attribution, diagnostics provider
  merging, and HTTP diagnostics JSON.

## Evidence

Smoke:

`reports/identity-http-benchmark.operation-timing-smoke.json`

- 128 concurrency
- 256 operations per phase
- 2 gateway workers
- 12 session DB connections per gateway
- zero phase errors
- confirmed `gatewayDatabaseDiagnostics.after.gateways[].stats.sessionOperations`
  appears in a real benchmark report

4400 baseline shape with operation timing:

`reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-pgbouncer120-operation-timing-ingress19080-clean-table-docker-bench.json`

Pool20 comparison:

`reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool20-client200-unlogged-session-table-pgbouncer120-operation-timing-ingress19080-clean-table-docker-bench.json`

Multi-worker comparison:

`reports/identity-http-benchmark.concurrency4400-multi10-ingress22-pool12-client200-unlogged-session-table-pgbouncer120-operation-timing-ingress19080-clean-table-docker-bench.json`

All 4400 runs used:

- Docker Go load generator
- PgBouncer `max_db_connections=120`
- 22 ingress workers
- 200 client connections per ingress target
- `identity_sessions` as `UNLOGGED`
- 4400 logical concurrency
- 8800 operations per phase
- local secret `ueacd`

## 4400 Comparison

| Profile | passwordLogin P99 | principalLookup P99 | refreshRotation P99 | revokeCycle P99 | Total duration | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| multi6 pool12 | 1940.04ms | 1523.27ms | 1363.93ms | 3168.97ms | 187163.57ms | Diagnostic baseline for SDD 0152 |
| multi6 pool20 | 1656.54ms | 1454.02ms | 1334.63ms | 3417.51ms | 194984.92ms | Mixed; do not promote |
| multi10 pool12 | 2072.37ms | 1425.48ms | 1306.17ms | 2999.28ms | 191629.74ms | Mixed; useful direction, not default |

## Operation Timing Findings

Aggregated `sessionOperations` from the multi6 pool12 run:

| Operation | Count | Average elapsed | Max elapsed |
| --- | ---: | ---: | ---: |
| getPrincipalByAccessToken | 17600 | 501.88ms | 868.56ms |
| saveSession | 30800 | 319.99ms | 868.88ms |
| rotateRefreshSession | 8800 | 224.30ms | 455.29ms |
| revokeOwnSession | 30800 | 215.16ms | 869.56ms |

Gateway pool diagnostics from the same run:

- each of 6 gateways used `maxConns=12`
- each gateway had about `14668-14683` DB acquire attempts
- each gateway accumulated about `4307-4467s` of pgx acquire duration
- `emptyAcquireWaitTimeMs` almost exactly matched acquire duration

PostgreSQL diagnostics from the same run:

- timeline samples: 94
- maximum active PostgreSQL backends: 4
- maximum total PostgreSQL backends: 66
- no deadlock evidence

PgBouncer diagnostics from the same run:

- total query count: 88570
- average query time: about 4.43ms
- average wait time: about 0.022ms

Interpretation: high-concurrency latency is mostly gateway-side local pool
queueing and process scheduling pressure. PostgreSQL and PgBouncer are not the
primary saturated layer in this profile.

## Configuration Interpretation

Increasing each gateway pool from 12 to 20 reduced some operation averages and
improved standalone login P99, but it made revoke-cycle P99 worse. That means
the bottleneck is not solved by simply giving each existing worker more DB
connections.

Increasing workers from 6 to 10 while keeping pool12 improved revoke-cycle P99
and refresh P99, but worsened standalone login P99 and total runtime. That means
more workers help distribute local queues, but the current ingress/client/gateway
shape still creates cross-phase tail movement rather than a clean win.

Do not freeze either profile as the default. The next configuration experiment
should treat worker count, per-worker DB pool, ingress count, and client
connection fanout as a coupled matrix rather than a single knob.

## Verification

Commands run:

```powershell
go test ./services/identity-access-gateway/internal/adapter/postgres ./services/identity-access-gateway/internal/adapter/httpapi
go test ./services/identity-access-gateway/...
npm run verify:structure
git diff --check
npm run quality
npm run perf:identity-session:up
node tools/run-identity-http-benchmark.mjs --out reports/identity-http-benchmark.operation-timing-smoke.json --concurrency 128 --operations 256 --session-db-max-conns 12 --session-db-session-table-persistence unlogged --gateway-count 2 --max-conns-per-host 128 --warm-connections-per-host 128 --pgbouncer-diagnostics true --timeout 120s
npm run perf:identity-session:down
npm run perf:identity-session:up
go run ./services/identity-access-gateway/cmd/sessionmaint -database-url "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable" -out reports/identity-session-maintenance.pre-4400-operation-timing-ingress19080.json -limit 1000000 -inactive-before 0s -vacuum full -timeout 300s
npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --session-db-write-concurrency 0 --session-db-session-table-persistence unlogged --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 2400 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-pgbouncer120-operation-timing-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000
go run ./services/identity-access-gateway/cmd/sessionmaint -database-url "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable" -out reports/identity-session-maintenance.post-4400-operation-timing-ingress19080.json -limit 1000000 -inactive-before 0s -vacuum none -timeout 300s
npm run perf:identity-session:down
npm run perf:identity-session:up
go run ./services/identity-access-gateway/cmd/sessionmaint -database-url "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable" -out reports/identity-session-maintenance.pre-4400-pool20-operation-timing-ingress19080.json -limit 1000000 -inactive-before 0s -vacuum full -timeout 300s
npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 20 --session-db-write-concurrency 0 --session-db-session-table-persistence unlogged --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 2400 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool20-client200-unlogged-session-table-pgbouncer120-operation-timing-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000
go run ./services/identity-access-gateway/cmd/sessionmaint -database-url "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable" -out reports/identity-session-maintenance.post-4400-pool20-operation-timing-ingress19080.json -limit 1000000 -inactive-before 0s -vacuum none -timeout 300s
npm run perf:identity-session:down
npm run perf:identity-session:up
go run ./services/identity-access-gateway/cmd/sessionmaint -database-url "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable" -out reports/identity-session-maintenance.pre-4400-multi10-pool12-operation-timing-ingress19080.json -limit 1000000 -inactive-before 0s -vacuum full -timeout 300s
npm run bench:identity-http:pgbouncer:docker -- --gateway-count 10 --session-db-max-conns 12 --session-db-write-concurrency 0 --session-db-session-table-persistence unlogged --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 2400 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi10-ingress22-pool12-client200-unlogged-session-table-pgbouncer120-operation-timing-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000
go run ./services/identity-access-gateway/cmd/sessionmaint -database-url "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable" -out reports/identity-session-maintenance.post-4400-multi10-pool12-operation-timing-ingress19080.json -limit 1000000 -inactive-before 0s -vacuum none -timeout 300s
npm run perf:identity-session:down
```

Quality:

- `npm run quality`: PASS before the live performance follow-up.
- Focused Identity tests passed.
- `git diff --check` passed; only Windows LF/CRLF warnings were printed.

Cleanup:

- Post-run maintenance reports show `identity_sessions.totalRows=0`.
- Docker performance containers were stopped and removed after every run.

## Next Step

Add per-phase gateway database diagnostics or a phase-aware summary so the next
matrix run can separate seed/cleanup pressure from measured phase pressure.
Then test a smaller coupled matrix around:

- gateway workers: 8, 10, 12
- per-worker session DB pool: 10, 12, 14
- ingress workers: 16, 22
- client connections per ingress target: 150, 200

The current evidence says the next useful optimization is not another isolated
PostgreSQL setting. It is reducing gateway-local queueing and transport fanout
without shifting the tail into login or revoke-cycle composite latency.
