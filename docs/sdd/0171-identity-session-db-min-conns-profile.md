# SDD 0171: Identity Session DB Min Connections Profile

## Problem

P78/P79 showed that some Identity session write operations spend most of their
elapsed time waiting for a gateway-local pgx pool connection, while the SQL
execution time is much smaller. That evidence is useful, but it still cannot
separate cold connection creation from steady-state pool queueing because the
gateway always runs PostgreSQL session pools with `MinConns = 0`.

Blindly increasing workers or max pool sizes has already failed in P73/P68, so
the next safe step is not a new default. The safe step is to expose minimum
session DB connections as an explicit benchmark/runtime profile field, record it
in reports, and test whether warm pools reduce observed acquire wait.

## Source Requirement References

- Root requirements: Identity remains the shared access boundary for teacher,
  student, remote command, teaching archive, research conversation, knowledge,
  and Agent Harness flows.
- SDD 0161/0169/0170: Identity performance work must preserve session semantics
  and expose operation-level evidence instead of relying on a single headline
  P99.
- P73/P68 evidence: worker count, pool size, and write limiter changes require
  measured proof and must not be promoted from a narrow pass.

## Scope

In scope:

- Add `SESSION_DB_MIN_CONNS` to the Identity gateway PostgreSQL session pool.
- Default the new setting to `0`, preserving existing runtime behavior.
- Reject negative values and values greater than `SESSION_DB_MAX_CONNS`.
- Add `--session-db-min-conns` to the Identity HTTP benchmark runner.
- Record per-worker and total min-connection settings in benchmark reports.
- Pass the same option through the Identity phase matrix runner.

Out of scope:

- Changing production defaults, PgBouncer limits, PostgreSQL limits, worker
  count, write concurrency, token/session semantics, or SQL.
- Claiming a new full-system concurrency ceiling without matrix evidence.
- Adding Redis, model/training/OCR/RAG/vector/embedding dependencies.

## Contracts

Gateway environment:

```text
SESSION_DB_MIN_CONNS=0
```

HTTP benchmark database profile:

```json
{
  "workerCount": 2,
  "sessionDbMaxConnsPerWorker": 8,
  "sessionDbMaxConnsTotal": 16,
  "sessionDbMinConnsPerWorker": 4,
  "sessionDbMinConnsTotal": 8
}
```

Phase matrix case config:

```json
{
  "sessionDbMaxConnsPerWorker": 8,
  "sessionDbMaxConnsTotal": 16,
  "sessionDbMinConnsPerWorker": 4,
  "sessionDbMinConnsTotal": 8
}
```

## Acceptance Criteria

- Go focused tests prove default, valid, negative, non-integer, and greater than
  max `SESSION_DB_MIN_CONNS` values are handled.
- Node focused tests prove the HTTP benchmark parses, validates, records, and
  passes `--session-db-min-conns` to gateway process environments.
- Node focused tests prove the phase matrix passes and records
  `--session-db-min-conns` without changing compact case specs.
- A real smoke run records the min-connection profile in generated JSON.
- Focused tests, `npm run verify:structure`, `npm run quality`, and
  `git diff --check` pass.

## Rollback

Remove the `SESSION_DB_MIN_CONNS` env parsing, `--session-db-min-conns` runner
option, and derived report fields. Existing max-connection, write-concurrency,
and operation pool-attribution diagnostics remain unchanged.
