# SDD 0005: PgBouncer Performance Profile

## Problem

The connection budget plan says combined legacy plus Go load tests should use PgBouncer transaction pooling. The legacy performance compose file already defines a PgBouncer service, but the backend service still defaults to direct PostgreSQL routing and a larger per-worker database pool.

Without an executable profile gate, it is easy to believe a test is using PgBouncer while the backend is still consuming direct PostgreSQL server connections.

## Source Requirement References

- Root requirement: the application must run efficiently and stably as a desktop teaching/research assistant.
- Architecture board: use Docker/PgBouncer for multi-worker performance testing before judging high concurrency.
- SDD 0002: combined tests must pass a global connection budget.
- SDD 0004: PgBouncer transaction mode is the recommended combined high-concurrency profile.

## Scope

In scope:

- Define a machine-readable PgBouncer performance profile contract.
- Audit the legacy performance compose, PgBouncer ini, and userlist files.
- Provide a refactor-owned Docker Compose override that routes backend traffic through PgBouncer for performance tests.
- Verify secrets in the performance profile use the required `ueacd` value.
- Write current and proposed profile reports.

Out of scope:

- Editing the legacy application source in this slice.
- Running a full load test in this slice.
- Replacing all legacy Docker compose files.

## Contracts Touched

- `contracts/config/pgbouncer-perf-profile.schema.json`
- `contracts/config/pgbouncer-perf-profile.current.json`
- `contracts/config/pgbouncer-perf-profile.proposed.json`
- `infra/perf/docker-compose.pgbouncer.override.yml`

## Acceptance Criteria

- Current legacy perf profile is reported as not ready when backend routes directly to PostgreSQL.
- Proposed refactor override routes backend to PgBouncer at `pgbouncer-perf:6432`.
- Proposed backend pool defaults are `DB_POOL_SIZE=2` and `DB_MAX_OVERFLOW=0`.
- PgBouncer config uses `pool_mode=transaction`.
- PgBouncer server connections are capped below the target PostgreSQL safe budget.
- Performance secrets in the audited profile are `ueacd`.
- Root `npm test` passes.

## Rollback

The override file is additive. If PgBouncer causes test instability, run the base legacy performance compose without the override and keep direct-limited connection budgets for smoke tests.

## Observability And Performance Evidence

Every combined performance run should capture:

- PostgreSQL `max_connections` and `shared_buffers`.
- PgBouncer `pool_mode`, `max_db_connections`, client count, and server count.
- Backend worker count and effective `DB_POOL_SIZE`.
- `pg_stat_activity` before, during, and after the run.
- RPS, P95, P99, error rate, CPU, and memory for read, write, and mixed profiles.
