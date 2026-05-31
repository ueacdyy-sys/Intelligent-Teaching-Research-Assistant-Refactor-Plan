# P16 Identity Clean-Table Upper-Bound Probe

## Summary

Added SDD 0097 and registered a clean-table 4400-concurrency Dockerized
Identity HTTP probe as required performance evidence.

This moves the current clean-table local pass point from 4000 to 4400
concurrent clients without changing public Identity HTTP contracts, PostgreSQL
limits, PgBouncer limits, baseline runtime dependencies, or model/training
dependencies.

## Red Gate

`npm run audit:performance-evidence` failed before the source report existed:

`ENOENT: no such file or directory, open 'reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client150-upwarm22-clean-table-docker-bench.json'`

## Pre-Probe Maintenance

Command:

`npm run maint:identity-session:pgbouncer -- -limit 1000000 -vacuum analyze -out reports/identity-session-maintenance.pre-4400-clean-table.json -timeout 300s`

Result:

| Metric | Before | After |
| --- | ---: | ---: |
| totalRows | 0 | 0 |
| activeRows | 0 | 0 |
| revokedRows | 0 | 0 |
| prunedRows | 0 | 0 |
| tableSize | 0 B | 0 B |

## Live Probe

Command:

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --ingress-proxy true --ingress-port 18080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 150 --warm-connections-per-host 150 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client150-upwarm22-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000`

Result: passed with zero phase errors.

| Phase | P95 | P99 | RPS | Errors |
| --- | ---: | ---: | ---: | ---: |
| passwordLogin | 1653.74ms | 1833.35ms | 3374.17 | 0 |
| principalLookup | 1127.18ms | 1309.13ms | 4759.87 | 0 |
| refreshRotation | 1200.60ms | 1436.98ms | 4233.39 | 0 |
| revokeCycle | 3095.18ms | 4295.02ms | 1762.37 | 0 |

Revoke-cycle step profile:

| Step | P95 | P99 |
| --- | ---: | ---: |
| login | 1455.86ms | 2052.54ms |
| revoke | 1245.01ms | 1351.52ms |
| revokedPrincipalLookup | 1248.25ms | 1914.82ms |

## Post-Probe Maintenance Check

Command:

`npm run maint:identity-session:pgbouncer -- -limit 1000000 -vacuum none -out reports/identity-session-maintenance.post-4400-clean-table.json -timeout 300s`

Result:

| Metric | Before | After |
| --- | ---: | ---: |
| totalRows | 0 | 0 |
| activeRows | 0 | 0 |
| revokedRows | 0 | 0 |
| prunedRows | 0 | 0 |
| tableSize | 0 B | 0 B |

## Interpretation

The current clean-table Dockerized upper pass point is now 4400 concurrent
clients with 8800 operations per phase and zero phase errors.

Latency is still rising rather than flat. `revokeCycle` remains the limiting
mixed read/write phase: P95 crossed 3 seconds and P99 crossed 4 seconds. The
next performance slice should either probe 4800 to find the hard boundary or
reduce revoke-cycle tail latency before making broader ultra-high-concurrency
claims.

## Verification

- `npm run audit:performance-evidence`: READY with 26 evidence entries.
- Docker performance stack was stopped after the probe.
