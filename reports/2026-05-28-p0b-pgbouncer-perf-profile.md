# P0b PgBouncer Performance Profile Report

## Scope

Added an executable PgBouncer performance profile gate for whole-system refactor performance testing.

This slice supports the larger objective: rebuild the complete Intelligent Teaching Research Assistant module by module, while keeping the root requirements as the product boundary.

Files added:

- `docs/sdd/0005-pgbouncer-perf-profile.md`
- `docs/roadmap/whole-system-module-map.md`
- `contracts/config/pgbouncer-perf-profile.schema.json`
- `contracts/config/pgbouncer-perf-profile.current.json`
- `contracts/config/pgbouncer-perf-profile.proposed.json`
- `infra/perf/docker-compose.pgbouncer.override.yml`
- `tools/pgbouncer-perf-profile-audit.mjs`
- `tools/pgbouncer-perf-profile-audit.test.mjs`

Files generated:

- `reports/pgbouncer-perf-profile.current.json`
- `reports/pgbouncer-perf-profile.proposed.json`

## Current Legacy Perf Profile

Command:

```powershell
npm run audit:pgbouncer-perf:current
```

Result:

```text
PgBouncer perf profile: NEEDS_REMEDIATION
```

Key failures:

| Gate | Actual | Expected |
| --- | --- | --- |
| backend.postgres_host | `postgres-perf` | `pgbouncer-perf` |
| backend.postgres_port | `5432` | `6432` |
| backend.db_pool_size | `3` | `<=2` |
| backend.depends_on_pgbouncer | `false` | `true` |

Interpretation:

The old performance compose file defines PgBouncer, but the backend still routes directly to PostgreSQL by default. A high-concurrency result from that profile should be treated as direct PostgreSQL evidence, not PgBouncer evidence.

## Proposed Refactor Profile

Command:

```powershell
npm run audit:pgbouncer-perf:proposed
```

Result:

```text
PgBouncer perf profile: READY
```

The additive override:

`infra/perf/docker-compose.pgbouncer.override.yml`

sets:

- `POSTGRES_HOST=pgbouncer-perf`
- `POSTGRES_PORT=6432`
- `DB_POOL_SIZE=2`
- `DB_MAX_OVERFLOW=0`
- backend startup depends on `pgbouncer-perf`

## Connection Budget Alignment

The proposed profile aligns with:

```powershell
npm run budget:connections:pgbouncer
```

Expected result:

```text
planned=64
safeLimit=190
hardLimit=280
```

## How To Use For Combined Tests

From the refactor workspace:

```powershell
docker compose -f ..\智能教研助手\docker-compose.perf.yml -f infra\perf\docker-compose.pgbouncer.override.yml --profile pgbouncer up
```

Before measuring throughput, record:

- PostgreSQL `max_connections`
- PostgreSQL `shared_buffers`
- PgBouncer `SHOW POOLS`
- PgBouncer `SHOW STATS`
- PostgreSQL `pg_stat_activity`
- backend worker count
- effective `DB_POOL_SIZE` and `DB_MAX_OVERFLOW`

## Decision

Use the proposed PgBouncer override for combined legacy plus Go high-concurrency testing.

Do not use the base legacy performance compose alone to judge whether the system supports ultra-high concurrency, because it still direct-routes backend database traffic and keeps a larger per-worker pool than the target combined profile.
