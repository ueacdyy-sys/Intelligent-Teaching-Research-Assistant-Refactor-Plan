# P15 Identity Inactive Session Maintenance

## Summary

Added SDD 0096, a PostgreSQL adapter maintenance operation, and a local CLI for
Identity inactive-session pruning.

This closes the loop from SDD 0095: new revoke operations no longer create
revoked rows, and old revoked/expired rows can now be explicitly removed before
high-concurrency performance evidence is collected.

## Implementation

- Added `PruneInactiveSessions(ctx, cutoff, limit)` to the PostgreSQL session
  store.
- Added `services/identity-access-gateway/cmd/sessionmaint`.
- Added `npm run maint:identity-session:pgbouncer`.
- The CLI emits JSON with before/after row counts, table sizes, cutoff, limit,
  pruned rows, and vacuum mode.
- Maintenance is explicit and is not part of `npm test` or gateway startup.

## Red Tests

Focused tests failed before implementation because:

- `PruneInactiveSessions` did not exist.
- the maintenance CLI report and validation helpers did not exist.

## Verification

Focused checks:

- `go test ./services/identity-access-gateway/cmd/sessionmaint ./services/identity-access-gateway/internal/adapter/postgres -run 'Test(BuildMaintenanceReportIncludesPruneEvidence|ValidateConfigRejectsInvalidLimit|SessionStorePrunesInactiveSessions)' -count=1 -v`: passed
- `go test ./services/identity-access-gateway/cmd/sessionmaint ./services/identity-access-gateway/internal/adapter/postgres -run Test -count=1 -v`: passed

Live maintenance:

`npm run maint:identity-session:pgbouncer -- -limit 1000000 -vacuum full -out reports/identity-session-maintenance.prune-inactive-current.json -timeout 600s`

| Metric | Before | After |
| --- | ---: | ---: |
| totalRows | 451158 | 0 |
| activeRows | 0 | 0 |
| revokedRows | 451158 | 0 |
| totalSize | 539.7 MB | 56 KB |
| tableSize | 393.7 MB | 0 B |

Rows pruned: `451158`.

Clean-table Dockerized 4000-concurrency benchmark:

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --ingress-proxy true --ingress-port 18080 --ingress-count 20 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 150 --warm-connections-per-host 150 --concurrency 4000 --operations 8000 --out reports/identity-http-benchmark.concurrency4000-multi6-ingress20-pool12-client150-upwarm22-clean-table-docker-bench.json --timeout 1900s --startup-timeout-ms 180000`

Result: passed with zero phase errors.

| Metric | P95 |
| --- | ---: |
| passwordLogin | 1563.61ms |
| principalLookup | 925.42ms |
| refreshRotation | 1118.95ms |
| revokeCycle | 2613.65ms |
| revokeCycle.login | 990.34ms |
| revokeCycle.revoke | 951.95ms |
| revokeCycle.revokedPrincipalLookup | 882.82ms |

Post-benchmark table state:

| total_sessions | active_sessions | revoked_sessions | total_size | table_size |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 0 | 0 | 5392 kB | 0 bytes |

## Interpretation

The abnormal `refreshRotation.p95_ms = 5151.99` from the prior diagnostic run
did not reproduce after inactive-row cleanup. It returned to `1118.95ms`, close
to the previous clean 4000-concurrency baseline.

`revokeCycle` remains the slowest phase because it performs three HTTP/database
steps per logical operation. The next useful performance slice should optimize
that mixed operation shape or push the clean-table upper bound above 4000.

## Next Step

Register the maintenance and clean-table benchmark reports in the performance
evidence registry, then use this maintenance step before future upper-bound
probes.
