# SDD 0003: Legacy DB Pool Audit

## Problem

P0b cannot be completed only with a manual connection budget. The legacy backend contains multiple SQLAlchemy engine creation sites. Some are async request-path pools, while others are synchronous research persistence helpers. Under multi-worker Gunicorn, every process can instantiate its own pools, multiplying PostgreSQL connections.

The refactor needs an automated audit that identifies these engine sites and classifies their risk before changing legacy code or running combined load tests.

## Scope

In scope:

- Scan the legacy backend application tree for SQLAlchemy engine creation sites.
- Classify `create_async_engine` and `create_engine` usage.
- Detect explicit `NullPool` usage.
- Detect explicit `pool_size` and `max_overflow` settings.
- Estimate persistent connection exposure for unbounded/default QueuePool sites.
- Emit JSON report and human-readable summary.

Out of scope:

- Modifying the legacy backend in this slice.
- Proving runtime connection counts without PostgreSQL observation.
- Replacing SQLAlchemy with another database layer.

## Contract

Report schema:

`contracts/config/legacy-db-pool-audit.schema.json`

Audit command:

```powershell
npm run audit:legacy-db-pools
```

Output report:

`reports/legacy-db-pool-audit.current.json`

## Acceptance Criteria

- Tool tests cover async configured pools, sync default pools, and `NullPool`.
- The scan excludes tests, caches, and migration scripts by default when pointed at `backend/app`.
- Current legacy app audit reports all production engine creation sites under `backend/app`.
- Report identifies sync default QueuePool sites as high risk.
- Root `npm test` continues to pass.

## Rollback

Remove the audit schema, audit tool, audit tests, generated audit report, and
`audit:legacy-db-pools` script. Restore the previous manual connection-budget
review process. No legacy runtime files are changed by this slice.

## Follow-Up

Use audit findings to create a proposed safe connection profile and then decide whether each sync research helper should become:

- `NullPool` behind PgBouncer transaction pooling
- a shared explicitly bounded pool
- an async adapter behind the main request-path engine
