# P8 Identity HTTP Four-Gateway Scale Curve

## Summary

Added SDD 0086 and extended the current performance evidence registry with a
four-gateway Identity HTTP scale curve.

The tuned database profile stayed unchanged:

- PostgreSQL `max_connections=300`
- PostgreSQL `shared_buffers=1GB`
- PgBouncer transaction pooling
- PgBouncer `max_db_connections=90`
- Gateway `SESSION_DB_MAX_CONNS=16` per local gateway process

## Live Evidence

| Report | Gateway count | Concurrency | Operations per phase | Status | Password login P95 | Revoke cycle P95 | Errors |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| `identity-http-benchmark.concurrency896-multi4.json` | 4 | 896 | 1792 | PASSED | 522.99ms | 396.72ms | 0 |
| `identity-http-benchmark.concurrency960-multi4.json` | 4 | 960 | 1920 | PASSED | 225.95ms | 469.92ms | 0 |
| `identity-http-benchmark.concurrency1024-multi4.json` | 4 | 1024 | 2048 | PASSED | 261.97ms | 464.31ms | 0 |
| `identity-http-benchmark.concurrency1152-multi4.json` | 4 | 1152 | 2304 | PASSED | 271.45ms | 528.34ms | 0 |
| `identity-http-benchmark.concurrency1184-multi4.json` | 4 | 1184 | 2368 | PASSED | 335.96ms | 590.16ms | 0 |
| `identity-http-benchmark.concurrency1200-multi4.json` | 4 | 1200 | 2400 | FAILED | n/a | n/a | 62 |
| `identity-http-benchmark.concurrency1216-multi4.json` | 4 | 1216 | 2432 | FAILED | n/a | n/a | 282 |
| `identity-http-benchmark.concurrency1280-multi4.json` | 4 | 1280 | 2560 | FAILED | n/a | n/a | 196 |

Only the nearest durable pass/fail pair is kept as current registry evidence:

- `reports/identity-http-benchmark.concurrency1184-multi4.json`
- `reports/identity-http-benchmark.concurrency1200-multi4.json`

The 896, 960, 1024, 1152, 1216, and 1280 JSON probe files were exploratory and
are not kept as current registry reports.

## Interpretation

The 3-gateway profile passed at 768 and failed at 832 concurrency. The
4-gateway profile passed at 1184 and failed at 1200. This moves the measured
local pass point from 768 to 1184 and narrows the current 4-gateway limit band
to 1184-1200 concurrency.

The bottleneck still presents as gateway ingress or local accept/connect
pressure: the failed 1200 probe occurred during `passwordLogin` with connection
refusals, while the runner observed no gateway process exit before cleanup. The
database profile stayed unchanged, so this result continues to argue against
PostgreSQL/PgBouncer being the primary ceiling under this workload.

## Verification

Red focused test:

- `node --test tools/performance-evidence-registry-audit.test.mjs`: failed
  before the registry included the required 4-gateway reports.

Live checks:

- `npm run perf:identity-session:up`: started Docker identity session runtime.
- `npm run test:identity-session:pgbouncer`: passed.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 4 --concurrency 896 --operations 1792 --out reports/identity-http-benchmark.concurrency896-multi4.json --timeout 540s --startup-timeout-ms 180000`: passed.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 4 --concurrency 960 --operations 1920 --out reports/identity-http-benchmark.concurrency960-multi4.json --timeout 600s --startup-timeout-ms 180000`: passed.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 4 --concurrency 1024 --operations 2048 --out reports/identity-http-benchmark.concurrency1024-multi4.json --timeout 660s --startup-timeout-ms 180000`: passed.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 4 --concurrency 1152 --operations 2304 --out reports/identity-http-benchmark.concurrency1152-multi4.json --timeout 720s --startup-timeout-ms 180000`: passed.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 4 --concurrency 1280 --operations 2560 --out reports/identity-http-benchmark.concurrency1280-multi4.json --timeout 780s --startup-timeout-ms 180000`: failed and wrote structured evidence.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 4 --concurrency 1216 --operations 2432 --out reports/identity-http-benchmark.concurrency1216-multi4.json --timeout 750s --startup-timeout-ms 180000`: failed and wrote structured evidence.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 4 --concurrency 1184 --operations 2368 --out reports/identity-http-benchmark.concurrency1184-multi4.json --timeout 735s --startup-timeout-ms 180000`: passed.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 4 --concurrency 1200 --operations 2400 --out reports/identity-http-benchmark.concurrency1200-multi4.json --timeout 745s --startup-timeout-ms 180000`: failed and wrote structured evidence.
- `npm run perf:identity-session:down`: stopped and removed the Docker identity session runtime.
