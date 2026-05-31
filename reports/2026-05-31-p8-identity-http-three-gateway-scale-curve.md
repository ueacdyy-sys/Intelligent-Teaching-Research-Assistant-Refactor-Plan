# P8 Identity HTTP Three-Gateway Scale Curve

## Summary

Added SDD 0085 and extended the current performance evidence registry with a
three-gateway Identity HTTP scale curve.

The tuned database profile stayed unchanged:

- PostgreSQL `max_connections=300`
- PostgreSQL `shared_buffers=1GB`
- PgBouncer transaction pooling
- PgBouncer `max_db_connections=90`
- Gateway `SESSION_DB_MAX_CONNS=16` per local gateway process

## Live Evidence

| Report | Gateway count | Concurrency | Operations per phase | Status | Password login P95 | Revoke cycle P95 | Errors |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| `identity-http-benchmark.concurrency704-multi3.json` | 3 | 704 | 1408 | PASSED | 407.23ms | 344.36ms | 0 |
| `identity-http-benchmark.concurrency768-multi3.json` | 3 | 768 | 1536 | PASSED | 190.17ms | 370.14ms | 0 |
| `identity-http-benchmark.concurrency832-multi3.json` | 3 | 832 | 1664 | FAILED | n/a | n/a | 7 |
| `identity-http-benchmark.concurrency896-multi3.json` | 3 | 896 | 1792 | FAILED | n/a | n/a | 410 |

Only the nearest durable pass/fail pair is kept as current registry evidence:

- `reports/identity-http-benchmark.concurrency768-multi3.json`
- `reports/identity-http-benchmark.concurrency832-multi3.json`

The 704 and 896 JSON probe files were exploratory and are not kept as current
registry reports.

## Interpretation

The 2-gateway profile failed at 704 concurrency. The 3-gateway profile passed
at 704 and 768, then failed at 832. This moves the measured local pass point
from 640 to 768 and narrows the current 3-gateway limit band to 768-832
concurrency.

The bottleneck is still not primarily PostgreSQL/PgBouncer capacity under this
profile. The next optimization slice should compare either a 4-gateway local
profile or OS/socket backlog tuning, and should inspect gateway listener
behavior around the `passwordLogin` connection refusals.

## Verification

Red focused test:

- `node --test tools/performance-evidence-registry-audit.test.mjs`: failed
  before the registry included the required 3-gateway reports.

Live checks:

- `npm run perf:identity-session:up`: started Docker identity session runtime.
- `npm run test:identity-session:pgbouncer`: passed.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 3 --concurrency 704 --operations 1408 --out reports/identity-http-benchmark.concurrency704-multi3.json --timeout 450s --startup-timeout-ms 180000`: passed.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 3 --concurrency 896 --operations 1792 --out reports/identity-http-benchmark.concurrency896-multi3.json --timeout 540s --startup-timeout-ms 180000`: failed and wrote structured evidence.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 3 --concurrency 768 --operations 1536 --out reports/identity-http-benchmark.concurrency768-multi3.json --timeout 480s --startup-timeout-ms 180000`: passed.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 3 --concurrency 832 --operations 1664 --out reports/identity-http-benchmark.concurrency832-multi3.json --timeout 510s --startup-timeout-ms 180000`: failed and wrote structured evidence.
