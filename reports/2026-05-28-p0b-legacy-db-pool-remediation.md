# P0b Legacy DB Pool Remediation Report

## Scope

Converted the legacy DB pool audit into executable remediation actions and target connection budget profiles.

Files added:

- `docs/sdd/0004-legacy-db-pool-remediation-plan.md`
- `contracts/config/legacy-db-pool-remediation.schema.json`
- `contracts/config/connection-budget.proposed-direct-limited.json`
- `contracts/config/connection-budget.proposed-pgbouncer-transaction.json`
- `tools/legacy-db-pool-remediation.mjs`
- `tools/legacy-db-pool-remediation.test.mjs`

Files generated:

- `reports/legacy-db-pool-remediation.current.json`

## Test Evidence

Command:

```powershell
npm test
```

Result:

- structure verifier passed
- tool tests passed: 11 passed
- Go gateway tests passed

## Generated Plan Evidence

Command:

```powershell
npm run plan:legacy-db-pools
```

Result:

```text
Legacy DB pool remediation: recommended=pgbouncer-transaction

Target profiles:
- direct-limited: PASS
  planned=56, safeLimit=65, hardLimit=95
- pgbouncer-transaction: PASS
  planned=64, safeLimit=190, hardLimit=280
```

## Action Summary

| Legacy file | Action |
| --- | --- |
| `core/database.py` | Set request-path `DB_POOL_SIZE=2`, `DB_MAX_OVERFLOW=0` for combined legacy + Go tests unless a larger PgBouncer/PostgreSQL profile is active. |
| `services/research/node_store.py` | Replace sync default QueuePool with `NullPool` for PgBouncer transaction mode, or explicit `pool_size=1,max_overflow=0` for direct PostgreSQL fallback. |
| `services/research/persistence.py` | Same as above. |
| `services/research/rag_document_store.py` | Same as above. |

## Decision

Recommended route:

1. Implement PgBouncer transaction profile for combined load tests.
2. Make sync research helper pooling explicit, not default QueuePool.
3. Keep direct-limited profile as a fallback or local smoke mode.

## Next Engineering Step

Implement the smallest legacy patch that makes sync helper pool behavior explicit and environment-driven, then rerun:

```powershell
npm run audit:legacy-db-pools
npm run plan:legacy-db-pools
npm test
```

After that, restart the legacy backend and observe `pg_stat_activity` before any combined Go + legacy load test.
