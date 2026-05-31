# P29 Identity Session Persistence Evidence Gate

## Summary

This slice made the 4400-concurrency unlogged Identity session-table evidence
auditable from both the registry and the source benchmark report. The registry
can no longer claim `session_table.persistence=unlogged` unless:

- `databaseEvidence.applicationPool.sessionTablePersistence` is present,
- the source report records `gatewayDatabaseProfile.sessionTablePersistence`,
- the registry metric, registry application pool, and source report agree.

## SDD

- `docs/sdd/0112-identity-session-persistence-evidence-gate.md`

## Red Tests

Command:

`node --test tools/performance-evidence-registry-audit.test.mjs`

Result before implementation: failed as expected because the audit did not
check session table persistence evidence.

## Implementation

- Added `identity.session_persistence_profile` to the performance evidence
  registry audit.
- Added focused tests for missing registry application-pool persistence and
  missing source-report persistence.
- Added the unlogged 4400 benchmark report to the required performance
  evidence source list.
- Updated the unlogged 4400 registry entry to use the runner-level
  `--session-db-session-table-persistence unlogged` command.

## Regenerated Benchmark

Pre-run maintenance:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.pre-4400-unlogged-session-table-arg-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum full --timeout 300s`

Benchmark:

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --session-db-write-concurrency 0 --session-db-session-table-persistence unlogged --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 2400 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000`

Post-run maintenance:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.post-4400-unlogged-session-table-arg-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum none --timeout 300s`

## Benchmark Result

Report:

`reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-ingress19080-clean-table-docker-bench.json`

| Metric | Value |
| --- | ---: |
| Status | PASSED |
| Session table persistence | unlogged |
| Phase errors | 0 |
| Total duration | 164228.40ms |
| Login P95 | 1397.79ms |
| Principal lookup P95 | 1305.18ms |
| Refresh rotation P95 | 1120.44ms |
| Revoke-cycle P95 | 2738.96ms |

Against the logged insert-only-save baseline of `222742.75ms`, this rerun
improved total duration by `58514.35ms` (`26.27%`). Login and refresh P95 also
improved, while revoke-cycle P95 was worse than the logged baseline in this
specific rerun. That keeps the conclusion conservative: `unlogged` is a strong
explicit high-throughput profile, not a hidden default.

After the post-run maintenance command, direct PostgreSQL verification showed:

- `identity_sessions|logged`
- `identity_remote_command_nonces|logged`

## Verification

- `node --test tools/performance-evidence-registry-audit.test.mjs`
- `npm run audit:performance-evidence`

Both commands passed before the final strict quality gate.
