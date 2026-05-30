# P8 Identity HTTP Multi-Gateway Benchmark

## Summary

Added SDD 0084 and extended the Identity HTTP benchmark path so the runner can
start multiple local Go gateways and pass comma-separated base URLs to the Go
benchmark. The benchmark now routes operations across gateway base URLs with a
round-robin strategy and records gateway count, gateway base URLs, and load
balancing strategy in reports.

## Live Evidence

The database runtime remained the tuned SDD 0083 profile:

- PostgreSQL `max_connections=300`
- PostgreSQL `shared_buffers=1GB`
- PgBouncer transaction pooling
- PgBouncer `max_db_connections=90`
- Gateway `SESSION_DB_MAX_CONNS=16` per local gateway process

Live 2-gateway probes:

| Report | Concurrency | Operations per phase | Status | Password login P95 | Revoke cycle P95 | Errors |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| `identity-http-benchmark.concurrency360-multi2.json` | 360 | 720 | PASSED | 314.06ms | 201.82ms | 0 |
| `identity-http-benchmark.concurrency512-multi2.json` | 512 | 1024 | PASSED | 148.35ms | 278.80ms | 0 |
| `identity-http-benchmark.concurrency640-multi2.json` | 640 | 1280 | PASSED | 184.03ms | 313.65ms | 0 |
| `identity-http-benchmark.concurrency704-multi2.json` | 704 | 1408 | FAILED | n/a | n/a | 220 |
| `identity-http-benchmark.concurrency768-multi2.json` | 768 | 1536 | FAILED | n/a | n/a | 365 |

Only the nearest durable pass/fail pair is kept as machine-readable current
registry evidence:

- `reports/identity-http-benchmark.concurrency640-multi2.json`
- `reports/identity-http-benchmark.concurrency704-multi2.json`

The intermediate 360, 512, and 768 probe JSON files were not kept to avoid
turning the current reports folder into raw scratch output.

## Interpretation

The prior single-gateway tuned profile failed at 360 concurrency. With two local
identity gateway processes and round-robin routing, 640 concurrency passed with
zero phase errors, while 704 failed in `passwordLogin` with connection refusals.

This proves the earlier 360 failure was not the whole-system database ceiling.
It was at least partly a single gateway ingress capacity limit. The current
local 2-gateway evidence supports a measured 640-concurrency pass point and a
704-concurrency limit probe on this machine.

## Verification

Red focused tests:

- `node --test tools/run-identity-http-benchmark.test.mjs`: failed before
  multi-gateway failure evidence fields existed.
- `go test ./services/identity-access-gateway/cmd/httpbench`: failed before
  comma-separated base URLs and round-robin selection existed.

Focused checks after implementation:

- `node --test tools/run-identity-http-benchmark.test.mjs`: passed.
- `go test ./services/identity-access-gateway/cmd/httpbench`: passed.

Live checks:

- `npm run perf:identity-session:up`: started Docker identity session runtime.
- `npm run test:identity-session:pgbouncer`: passed.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 2 --concurrency 640 --operations 1280 --out reports/identity-http-benchmark.concurrency640-multi2.json --timeout 420s --startup-timeout-ms 180000`: passed.
- `npm run bench:identity-http:pgbouncer -- --gateway-count 2 --concurrency 704 --operations 1408 --out reports/identity-http-benchmark.concurrency704-multi2.json --timeout 450s --startup-timeout-ms 180000`: failed and wrote structured evidence.
