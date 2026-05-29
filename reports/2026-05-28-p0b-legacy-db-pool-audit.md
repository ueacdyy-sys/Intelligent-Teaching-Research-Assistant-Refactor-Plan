# P0b Legacy DB Pool Audit Report

## Scope

Scanned the legacy backend application tree:

`C:\Users\Administrator\Desktop\智能教研助手\backend\app`

The scan excludes tests, scripts, alembic, caches, and virtual environments.

## Command

```powershell
npm run audit:legacy-db-pools
```

The command writes:

`reports/legacy-db-pool-audit.current.json`

## Result

```text
Legacy DB pool audit: HIGH-RISK
filesScanned=358
engineSites=5
highRiskSites=3
estimatedDefaultQueuePoolMaxPerWorker=60
```

## Findings

| File | Engine | Risk | Estimated persistent connections per worker | Reason |
| --- | --- | --- | ---: | --- |
| `core/database.py:28` | `create_async_engine` | medium | 15 | Explicit async request-path pool; include in budget. |
| `core/database.py:48` | `create_async_engine` | low | 0 | SQLite branch uses `NullPool`. |
| `services/research/node_store.py:40` | `create_engine` | high | 15 | Sync SQLAlchemy default QueuePool. |
| `services/research/persistence.py:58` | `create_engine` | high | 15 | Sync SQLAlchemy default QueuePool. |
| `services/research/rag_document_store.py:34` | `create_engine` | high | 15 | Sync SQLAlchemy default QueuePool. |

## Budget Impact

The previous observed profile failed at:

```text
planned=100
safeLimit=65
hardLimit=95
```

The conservative audited worst-case profile now fails at:

```text
planned=1156
safeLimit=65
hardLimit=95
```

This explains why P0b must happen before combined Go + legacy high-concurrency testing.

## Decision

Do not treat the observed 96 idle connections as the real ceiling. It is only the visible symptom. The production tree contains three sync default QueuePool sites that can multiply per Gunicorn worker.

## Next Engineering Step

Create a legacy remediation plan:

1. Convert sync research helper engines to explicit low/zero persistent pool exposure.
2. Prefer `NullPool` if routed through PgBouncer transaction pooling.
3. Otherwise set explicit `pool_size` and `max_overflow=0` for every sync helper.
4. Re-run `npm run audit:legacy-db-pools`.
5. Re-run `npm run budget:connections:audited`.
