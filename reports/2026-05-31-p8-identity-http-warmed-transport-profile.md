# P8 Identity HTTP Warmed Transport Profile

## Summary

Added SDD 0087 and extended the Identity HTTP benchmark path with an explicit
transport profile. The benchmark can now cap per-gateway HTTP connections,
prewarm keep-alive connections, and record the transport settings in both
successful reports and Node-written failure reports.

The tuned database profile stayed unchanged:

- PostgreSQL `max_connections=300`
- PostgreSQL `shared_buffers=1GB`
- PgBouncer transaction pooling
- PgBouncer `max_db_connections=90`
- Gateway `SESSION_DB_MAX_CONNS=16` per local gateway process

## Live Evidence

| Report | Gateway count | Concurrency | Transport profile | Status | Password login P95 | Revoke cycle P95 | Errors |
| --- | ---: | ---: | --- | --- | ---: | ---: | ---: |
| `identity-http-benchmark.concurrency1200-multi4.json` | 4 | 1200 | cold direct, uncapped | FAILED | n/a | n/a | 62 |
| `identity-http-benchmark.concurrency1200-multi4-warm300.json` | 4 | 1200 | max 300 conns/host, warm 300 conns/host | PASSED | 582.69ms | 503.91ms | 0 |

## Interpretation

The direct 4-gateway 1200-concurrency probe failed during `passwordLogin` with
connection refusals. The warmed transport profile at the same concurrency
passed with zero phase errors after prewarming 300 keep-alive connections per
gateway and capping each gateway host at 300 concurrent HTTP transport
connections.

This means the application and database path can complete the 1200-concurrency
mixed read/write benchmark when the upstream connection pool is already warm.
The current local failure mode is therefore more specifically a cold
connection-establishment or gateway accept/backlog pressure problem, not a
PostgreSQL/PgBouncer ceiling.

The warmed profile is not a replacement for the direct-connection limit. It is
evidence for the next deployment-shape optimization: put a real ingress layer
or reverse proxy in front of the Go gateways, keep upstream connections warm,
and then retest the direct client-facing boundary.

## Verification

Red focused tests:

- `go test ./services/identity-access-gateway/cmd/httpbench -run TestBuildHTTPClientReportsTransportProfile -count=1 -v`: failed before `httpbench` exposed a transport profile.
- `node --test tools/run-identity-http-benchmark.test.mjs`: failed before failure reports included `transportProfile`.

Focused checks after implementation:

- `go test ./services/identity-access-gateway/cmd/httpbench -run TestBuildHTTPClientReportsTransportProfile -count=1 -v`: passed.
- `go test ./services/identity-access-gateway/cmd/httpbench -count=1 -v`: passed.
- `node --test tools/run-identity-http-benchmark.test.mjs`: passed.

Live checks:

- `npm run perf:identity-session:up`: started Docker identity session runtime.
- `npm run test:identity-session:pgbouncer`: passed.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 4 --concurrency 1200 --operations 2400 --max-conns-per-host 300 --warm-connections-per-host 300 --out reports/identity-http-benchmark.concurrency1200-multi4-warm300.json --timeout 780s --startup-timeout-ms 180000`: passed.
- `npm run perf:identity-session:down`: stopped and removed the Docker identity session runtime.
