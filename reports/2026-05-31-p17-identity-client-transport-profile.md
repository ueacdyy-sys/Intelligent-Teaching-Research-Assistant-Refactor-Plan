# P17 Identity Client Transport Profile

## Summary

Added SDD 0098 and registered a clean-table 4400-concurrency Identity HTTP
probe with client transport capacity raised from 3300 to 4400 warmed
load-generator connections.

This isolates whether the SDD 0097 `revokeCycle` tail was partly caused by the
load generator connection cap. The system still uses the same six gateway
workers, 22 ingress workers, PostgreSQL limit, PgBouncer limit, and gateway DB
pool budget. No public Identity HTTP contracts, model/training dependencies,
OCR, RAG, embeddings, or vector database dependencies were introduced.

## Red Gate

`npm run audit:performance-evidence` failed before the source report existed:

`ENOENT: no such file or directory, open 'reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-upwarm22-clean-table-docker-bench.json'`

## Pre-Probe Maintenance

Command:

`npm run maint:identity-session:pgbouncer -- -limit 1000000 -vacuum analyze -out reports/identity-session-maintenance.pre-4400-client200-clean-table.json -timeout 300s`

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

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --ingress-proxy true --ingress-port 18080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-upwarm22-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000`

Result: passed with zero phase errors.

| Phase | P95 | P99 | RPS | Errors |
| --- | ---: | ---: | ---: | ---: |
| passwordLogin | 1819.11ms | 2173.25ms | 3409.16 | 0 |
| principalLookup | 1123.04ms | 1364.96ms | 4742.73 | 0 |
| refreshRotation | 1216.89ms | 1446.38ms | 4067.05 | 0 |
| revokeCycle | 3042.92ms | 3794.21ms | 1762.59 | 0 |

Revoke-cycle step profile:

| Step | P95 | P99 |
| --- | ---: | ---: |
| login | 1244.06ms | 1714.57ms |
| revoke | 1276.95ms | 1457.52ms |
| revokedPrincipalLookup | 1255.29ms | 1473.53ms |

## Comparison With Client-150 Baseline

| Metric | Client 150 | Client 200 | Change |
| --- | ---: | ---: | ---: |
| passwordLogin P95 | 1653.74ms | 1819.11ms | +165.37ms |
| principalLookup P95 | 1127.18ms | 1123.04ms | -4.14ms |
| refreshRotation P95 | 1200.60ms | 1216.89ms | +16.29ms |
| revokeCycle P95 | 3095.18ms | 3042.92ms | -52.26ms |
| revokeCycle P99 | 4295.02ms | 3794.21ms | -500.81ms |
| revokeCycle.login P95 | 1455.86ms | 1244.06ms | -211.80ms |
| revokeCycle.login P99 | 2052.54ms | 1714.57ms | -337.97ms |

## Post-Probe Maintenance Check

Command:

`npm run maint:identity-session:pgbouncer -- -limit 1000000 -vacuum none -out reports/identity-session-maintenance.post-4400-client200-clean-table.json -timeout 300s`

Result:

| Metric | Before | After |
| --- | ---: | ---: |
| totalRows | 0 | 0 |
| activeRows | 0 | 0 |
| revokedRows | 0 | 0 |
| prunedRows | 0 | 0 |
| tableSize | 0 B | 0 B |

## Interpretation

The client-side transport cap was contributing to the extreme
`revokeCycle` tail. Raising the warmed client transport profile from 3300 to
4400 total client-side connections improved `revokeCycle` P99 by 500.81ms and
improved the login sub-step tail.

It did not solve the write-path bottleneck. `revokeCycle` P95 only improved by
52.26ms and still sits just above 3 seconds, while standalone `passwordLogin`
P95 worsened. That means the next useful performance slice should optimize or
profile the mixed write path itself, or use this client-200 profile for a 4800
probe only as a boundary test. This evidence is not enough to claim a broad
ultra-high-concurrency ceiling.

## Verification

- `npm run audit:performance-evidence`: READY with 27 evidence entries.
- `npm test`: passed.
- `npm run quality`: passed with 19 command gates and zero static findings.
- Docker performance stack was stopped after the probe.
- `services/agent-harness/target` was removed after Rust tests and verified absent.
