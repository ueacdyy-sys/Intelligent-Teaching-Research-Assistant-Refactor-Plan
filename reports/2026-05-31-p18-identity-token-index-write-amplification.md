# P18 Identity Token Index Write Amplification

## Summary

Added SDD 0099 and removed two redundant `identity_sessions` active-token
partial indexes from the Identity PostgreSQL schema:

- `idx_identity_sessions_access_active`
- `idx_identity_sessions_refresh_active`

The hot table still keeps `access_token` and `refresh_token` unique indexes, so
token lookup semantics and uniqueness stay intact. Read queries still include
`revoked_at IS NULL` so legacy revoked rows remain invalid. No public Identity
HTTP contracts, token semantics, PostgreSQL limits, PgBouncer limits, baseline
runtime dependencies, model/training dependencies, OCR, RAG, embeddings, or
vector database dependencies were introduced.

## Red Test

Focused test before implementation:

`go test ./services/identity-access-gateway/internal/adapter/postgres -run TestEnsureSchemaDropsRedundantActiveTokenIndexes -count=1 -v`

Result: failed because `EnsureSchema` still created the redundant partial
indexes and did not drop them.

## Implementation

- Replaced the two partial-index creation statements in `EnsureSchema` with
  `DROP INDEX IF EXISTS` statements.
- Mirrored the same schema contract in `contracts/sql/identity-sessions.sql`.
- Added a focused schema test proving:
  - both redundant indexes are dropped,
  - neither redundant index is recreated,
  - token uniqueness constraints remain in the table definition.

## Focused Verification

`go test ./services/identity-access-gateway/internal/adapter/postgres -run 'TestEnsureSchemaDropsRedundantActiveTokenIndexes|TestSessionStore(RevokeInvalidatesTokens|RevokeOwnSessionUsesAccessAndSessionCondition|RotateRefreshSessionReturnsUpdatedPrincipal)' -count=1 -v`

Result: passed.

## Migrated Index State

Command:

`docker exec -e PGPASSWORD=ueacd ita-identity-session-postgres psql -U app_user -d intelligent_teaching_assistant -t -A -F "|" -c "select indexname from pg_indexes where schemaname='public' and tablename='identity_sessions' order by indexname;"`

Observed indexes:

| Index |
| --- |
| identity_sessions_access_token_key |
| identity_sessions_pkey |
| identity_sessions_refresh_token_key |
| idx_identity_sessions_expires_at |

The removed partial indexes were absent from the migrated database.

## Pre-Probe Maintenance

Command:

`npm run maint:identity-session:pgbouncer -- -limit 1000000 -vacuum analyze -out reports/identity-session-maintenance.pre-4400-client200-drop-active-token-indexes.json -timeout 300s`

Result:

| Metric | Before | After |
| --- | ---: | ---: |
| totalRows | 0 | 0 |
| activeRows | 0 | 0 |
| revokedRows | 0 | 0 |
| prunedRows | 0 | 0 |
| tableSize | 0 B | 0 B |
| totalSize | 3.7 MB | 3.7 MB |

## Live Probe

Command:

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --ingress-proxy true --ingress-port 18080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-drop-active-token-indexes-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000`

Result: passed with zero phase errors.

| Phase | P95 | P99 | RPS | Errors |
| --- | ---: | ---: | ---: | ---: |
| passwordLogin | 1863.09ms | 2072.39ms | 3028.43 | 0 |
| principalLookup | 1252.76ms | 1382.14ms | 4161.77 | 0 |
| refreshRotation | 1290.25ms | 1475.92ms | 3992.06 | 0 |
| revokeCycle | 3145.17ms | 4017.71ms | 1705.03 | 0 |

Revoke-cycle step profile:

| Step | P95 | P99 |
| --- | ---: | ---: |
| login | 1248.19ms | 1833.57ms |
| revoke | 1288.48ms | 1404.58ms |
| revokedPrincipalLookup | 1328.57ms | 1612.57ms |

## Comparison With SDD 0098 Client-200 Baseline

| Metric | Client 200 baseline | Drop active indexes | Change |
| --- | ---: | ---: | ---: |
| passwordLogin P95 | 1819.11ms | 1863.09ms | +43.98ms |
| principalLookup P95 | 1123.04ms | 1252.76ms | +129.72ms |
| refreshRotation P95 | 1216.89ms | 1290.25ms | +73.36ms |
| revokeCycle P95 | 3042.92ms | 3145.17ms | +102.25ms |
| revokeCycle P99 | 3794.21ms | 4017.71ms | +223.50ms |
| revokeCycle.login P95 | 1244.06ms | 1248.19ms | +4.13ms |
| revokeCycle.revoke P95 | 1276.95ms | 1288.48ms | +11.53ms |
| revokedPrincipalLookup P95 | 1255.29ms | 1328.57ms | +73.28ms |

## Post-Probe Maintenance Check

Command:

`npm run maint:identity-session:pgbouncer -- -limit 1000000 -vacuum none -out reports/identity-session-maintenance.post-4400-client200-drop-active-token-indexes.json -timeout 300s`

Result:

| Metric | Before | After |
| --- | ---: | ---: |
| totalRows | 0 | 0 |
| activeRows | 0 | 0 |
| revokedRows | 0 | 0 |
| prunedRows | 0 | 0 |
| tableSize | 0 B | 0 B |
| totalSize | 4.9 MB | 4.9 MB |

## Interpretation

Removing the redundant indexes is still the right schema cleanup: it reduces
write amplification, keeps the hot table smaller, and removes obsolete
structure left behind by the old mark-revoked design.

The live 4400 client-200 run did not show a latency improvement. All phases
passed with zero errors, but `revokeCycle` P95 and P99 were worse than the SDD
0098 client-200 baseline. This is a useful negative result: the current
high-concurrency tail is not explained by those two partial indexes alone.

The next performance slice should collect deeper evidence around database
scheduling, ingress-to-gateway queueing, or per-step connection wait behavior
before making further runtime changes.

## Verification

- `npm run audit:performance-evidence`: READY with 28 evidence entries.
- Docker performance stack was stopped after the probe.
