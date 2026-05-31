# P28 Identity Write Operation Diagnostics And Unlogged Session Profile

## Summary

This slice added operation-level Identity session write diagnostics, then used
that evidence to test a controlled PostgreSQL persistence profile for ephemeral
session state.

The key result: `identity_sessions` can be made `UNLOGGED` as an explicit
performance profile while `identity_remote_command_nonces` remains logged. In a
fresh 4400-concurrency Docker probe, this reduced total mixed workload duration
from 222742.75ms to 169629.32ms, a 23.85% improvement versus the logged
insert-only-save baseline.

## SDD

- `docs/sdd/0109-identity-write-limiter-operation-diagnostics.md`
- `docs/sdd/0110-identity-session-table-persistence-profile.md`

Both slices intentionally keep:

- no public Identity HTTP contract changes,
- no token, principal, login, refresh, logout, or remote command semantic
  changes,
- no default promotion of the write limiter,
- no unlogged remote command replay nonce table,
- no model, training, OCR, RAG, vector DB, or embedding dependency.

## Red Tests

Commands:

`go test ./services/identity-access-gateway/internal/adapter/postgres -run WriteLimiterStats -count=1`

`node --test tools/identity-gateway-diagnostics-summary.test.mjs`

`go test ./services/identity-access-gateway/internal/adapter/postgres -run 'EnsureSchema.*SessionTable|EnsureSchemaLogged' -count=1`

`go test ./services/identity-access-gateway/cmd/gateway -run 'SessionTablePersistence' -count=1`

Result before implementation: failed as expected because operation-level
limiter stats, operation summary aggregation, `EnsureSchemaWithConfig`, and
gateway persistence parsing did not exist.

## Implementation

- Added `stats.writeLimiter.operations` to gateway diagnostics.
- Attributed write-slot wait and cancellation counters to:
  - `saveSession`
  - `rotateSession`
  - `rotateRefreshSession`
  - `revokeSession`
  - `revokeOwnSession`
  - `pruneInactiveSessions`
  - `acceptRemoteCommand`
- Added operation aggregate snapshots and deltas to
  `gatewayWriteLimiterDiagnostics`.
- Added PostgreSQL relation diagnostics so reports can show whether
  `identity_sessions` is logged or unlogged.
- Added `SESSION_DB_SESSION_TABLE_PERSISTENCE=logged|unlogged`.
- Kept `logged` as the default.
- Kept `identity_remote_command_nonces` logged in both profiles.
- Made `EnsureSchemaWithConfig` able to convert `identity_sessions` between
  logged and unlogged modes.

## Operation Bottleneck Evidence

Report:

`reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-write10-client200-operation-diagnostics-ingress19080-clean-table-docker-bench.json`

| Operation | Acquire count | Acquire wait |
| --- | ---: | ---: |
| `saveSession` | 30800 | 12426267.10ms |
| `revokeOwnSession` | 30800 | 10144652.76ms |
| `rotateRefreshSession` | 8800 | 1963548.72ms |

Interpretation: the shaped-write queue is dominated by session creation and
self-revoke. Refresh rotation is not the primary bottleneck.

## Unlogged Benchmark

Pre-run maintenance:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.pre-4400-unlogged-session-table-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum full --timeout 300s`

Benchmark:

`$env:SESSION_DB_SESSION_TABLE_PERSISTENCE='unlogged'; npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --session-db-write-concurrency 0 --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 2400 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000`

Post-run maintenance:

`npm run maint:identity-session:pgbouncer -- --out reports/identity-session-maintenance.post-4400-unlogged-session-table-ingress19080.json --limit 1000000 --inactive-before 0s --vacuum none --timeout 300s`

## Benchmark Result

Report:

`reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-ingress19080-clean-table-docker-bench.json`

| Metric | Logged baseline | Unlogged session table | Delta |
| --- | ---: | ---: | ---: |
| Status | PASSED | PASSED | - |
| Total duration | 222742.75ms | 169629.32ms | -53113.43ms |
| Login P95 | 1573.89ms | 1372.69ms | -201.20ms |
| Read P95 | 1172.88ms | 1133.11ms | -39.77ms |
| Refresh P95 | 1305.65ms | 1222.36ms | -83.29ms |
| Revoke-cycle P95 | 2659.94ms | 2583.30ms | -76.64ms |
| Revoke step P95 | 997.92ms | 925.28ms | -72.64ms |
| Phase errors | 0 | 0 | 0 |

Relation diagnostics during the benchmark:

- `identity_sessions`: `unlogged`
- `identity_remote_command_nonces`: `logged`

After the benchmark, the default maintenance command converted
`identity_sessions` back to `logged`, so the local Docker database is no longer
left in the unlogged profile.

## Interpretation

This is the first configuration-level change in the current performance series
with a clear positive 4400-concurrency result. It improves write-heavy session
churn without changing Identity HTTP behavior and without weakening remote
command replay durability.

It should still stay explicit rather than silent default promotion. The tradeoff
is clear: if PostgreSQL crashes while `identity_sessions` is unlogged, active
sessions can be lost and users may need to log in again. That is acceptable for
a high-throughput desktop/local session profile, but it is a product decision,
not a hidden optimization.

## Verification

- `go test ./services/identity-access-gateway/... -count=1`
- `node --test tools/identity-postgres-diagnostics.test.mjs tools/identity-gateway-diagnostics-summary.test.mjs tools/run-identity-http-benchmark.test.mjs`
- `npm run audit:performance-evidence`
- `npm run quality`

Final gate result: passed. The strict quality gate wrote
`reports/quality-gate.current.json` with all command gates passing.
