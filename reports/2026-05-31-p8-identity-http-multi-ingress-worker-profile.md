# P8 Identity HTTP Multi Ingress Worker Profile

## Summary

Added SDD 0089 and extended the benchmark runner with `--ingress-count`.
Ingress workers now start on consecutive local ports and are warmed one at a
time, preventing startup warmup from becoming its own upstream connection
storm.

The current tuned profile keeps the database settings unchanged:

- PostgreSQL `max_connections=300`
- PostgreSQL `shared_buffers=1GB`
- PgBouncer transaction pooling
- PgBouncer `max_db_connections=90`
- Gateway `SESSION_DB_MAX_CONNS=16` per local gateway process

## Live Boundary

| Report | Ingress workers | Gateway workers | Concurrency | Status | Login P95 | Refresh P95 | Revoke P95 | Errors |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| `identity-http-benchmark.concurrency1600-multi4-ingress8-warm200.json` | 8 | 4 | 1600 | PASSED | 354.23ms | 517.01ms | 724.70ms | 0 |
| `identity-http-benchmark.concurrency2000-multi4-ingress10-warm200.json` | 10 | 4 | 2000 | PASSED | 514.56ms | 587.64ms | 997.78ms | 0 |
| `identity-http-benchmark.concurrency2400-multi4-ingress12-warm200.json` | 12 | 4 | 2400 | PASSED | 749.20ms | 966.58ms | 1131.21ms | 0 |
| `identity-http-benchmark.concurrency2600-multi4-ingress13-warm200.json` | 13 | 4 | 2600 | PASSED | 685.04ms | 1449.84ms | 1248.05ms | 0 |
| `identity-http-benchmark.concurrency2800-multi4-ingress14-warm200.json` | 14 | 4 | 2800 | FAILED | n/a | n/a | n/a | 465 |
| `identity-http-benchmark.concurrency3000-multi4-ingress15-warm200.json` | 15 | 4 | 3000 | FAILED | n/a | n/a | n/a | 192 |

## Interpretation

The current local steady-state pass point is 2600 concurrent clients for the
mixed Identity workload. The nearest failed probe is 2800 concurrent clients,
where the failure mode moved to ingress `502 upstream unavailable` responses
during `passwordLogin`.

That is a better bottleneck than the earlier cold connection refusal because it
means the entry tier is no longer the first wall. At this point the next
optimization should target gateway/upstream saturation and write-path tail
latency, especially refresh rotation and revoke cycle. At 2600 concurrency,
`refreshRotation.p95_ms` is 1449.84ms and `revokeCycle.p95_ms` is 1248.05ms.

## Verification

Focused checks:

- `node --test tools/run-identity-http-benchmark.test.mjs`: passed after
  adding `ingressCount`, aggregate warm totals, and staged ingress startup.

Live checks:

- `npm run bench:identity-http:pgbouncer -- --gateway-count 4 --ingress-proxy true --ingress-port 18080 --ingress-count 13 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 50 --max-conns-per-host 200 --warm-connections-per-host 200 --concurrency 2600 --operations 5200 --out reports/identity-http-benchmark.concurrency2600-multi4-ingress13-warm200.json --timeout 1300s --startup-timeout-ms 180000`: passed.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 4 --ingress-proxy true --ingress-port 18080 --ingress-count 14 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 50 --max-conns-per-host 200 --warm-connections-per-host 200 --concurrency 2800 --operations 5600 --out reports/identity-http-benchmark.concurrency2800-multi4-ingress14-warm200.json --timeout 1350s --startup-timeout-ms 180000`: failed.
- `npm run perf:identity-session:down`: stopped and removed the Docker identity session runtime.
