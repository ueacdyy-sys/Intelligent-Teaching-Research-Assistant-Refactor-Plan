# SDD 0002: Connection Budget Gate

## Problem

The first Go gateway smoke test proved that the new service can write to PostgreSQL, but it also exposed the current platform limit: the legacy backend can expand to 96 idle PostgreSQL connections after load. With PostgreSQL `max_connections=100`, even a 4-connection Go service can trigger `sorry, too many clients already`.

Before running combined legacy + Go performance tests, the refactor needs an executable connection budget gate.

## Source Evidence

- Legacy backend: 24 Gunicorn workers.
- Backend pool settings used during performance work: `DB_POOL_SIZE=3`, `DB_MAX_OVERFLOW=0`.
- Observed PostgreSQL state after load: 96 idle connections.
- Go gateway smoke with `DB_MAX_CONNS=4` hit connection exhaustion while the legacy backend was still expanded.

## Scope

In scope:

- Define a machine-readable connection budget contract.
- Compute total planned PostgreSQL connections across legacy and new services.
- Enforce both a hard maximum and a safer operating maximum.
- Fail fast before combined load tests when the plan is unsafe.
- Keep this as an ops/runtime gate in the refactor workspace.

Out of scope:

- Changing the legacy backend code in this slice.
- Deploying PgBouncer.
- Benchmarking throughput after the gate passes.

## Contract

Config schema:

`contracts/config/connection-budget.schema.json`

Default unsafe evidence profile:

`contracts/config/connection-budget.current.json`

Future safe profiles must be added explicitly before combined performance tests.

## Budget Formula

For each service:

`service connections = instances * workers * sum(pool max connections per worker)`

For fixed-pool services:

`service connections = instances * maxConns`

Global limits:

- hard usable connections: `maxConnections - reservedConnections`
- safe usable connections: `floor(maxConnections * safetyRatio) - reservedConnections`

The gate fails when total planned connections exceed the safe usable limit.

## Acceptance Criteria

- Current observed legacy + Go smoke profile fails the budget gate.
- A safe profile with higher PostgreSQL capacity or lower pool usage passes.
- Gate output includes total planned connections, safe limit, hard limit, per-service contributions, and remediation hints.
- Root `npm test` runs the gate tests.

## Rollback

This gate does not alter runtime state. If it blocks a test run, the fallback is to run legacy-only tests or adjust the environment profile before combining services.
