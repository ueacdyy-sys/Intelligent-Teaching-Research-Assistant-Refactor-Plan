# SDD 0176: Identity Session Query Exec Mode Profile

## Problem

P84 showed that raising `sessionDbMinConns` or `sessionDbMaxConns` does not
produce a safe Identity default change in the current 4400 system-shaped
matrix. The remaining hot path is still `revokeCycle.revokeOwnSession`, and
the dominant cost is pgx pool acquire pressure rather than SQL execution time.

The Identity session store runs through PgBouncer in the performance profile.
pgx defaults to `cache_statement`, which prepares and caches statements on a
connection. pgx also documents that this default can be a poor fit for
connection poolers such as PgBouncer. The system needs a measured, reportable
profile switch before any claim that a different PostgreSQL execution mode is
better for the current architecture.

## Source Requirement References

- Root requirements: Identity remains the shared access boundary for teacher,
  student, remote command, teaching archive, research conversation, knowledge,
  and Agent Harness flows.
- SDD 0155: the current 4400 Identity fanout is a candidate, not a whole-system
  ultra-concurrency promotion.
- SDD 0169 and SDD 0170: tuning decisions must use operation-level pool
  attribution, not only endpoint-level latency.
- SDD 0175: changing max/min pool defaults is blocked because no system-shaped
  case improved both P99 and pool acquire pressure.

## Scope

In scope:

- Add an Identity gateway runtime profile switch:
  `SESSION_DB_QUERY_EXEC_MODE`.
- Support the pgx execution modes:
  - `cache_statement`
  - `cache_describe`
  - `describe_exec`
  - `exec`
  - `simple_protocol`
- Keep the default as `cache_statement`.
- Pass the profile through the Identity HTTP benchmark and phase matrix
  runners.
- Record `sessionDbQueryExecMode` in benchmark and matrix reports so future
  evidence is attributable.
- Run a small Docker-isolated smoke comparison before any larger promotion.

Out of scope:

- Changing public Identity HTTP, auth, refresh, revoke, student app, remote
  command, or root workflow contracts.
- Changing the default query execution mode without benchmark evidence.
- Changing session SQL semantics, PgBouncer caps, PostgreSQL caps, worker
  counts, pool max/min defaults, write concurrency defaults, or ingress routing.
- Adding training, OCR, RAG, vector, embedding, model, Redis, or queue
  dependencies.

## Contracts

`SESSION_DB_QUERY_EXEC_MODE` maps to pgx as follows:

```json
{
  "": "cache_statement",
  "cache_statement": "pgx.QueryExecModeCacheStatement",
  "cache_describe": "pgx.QueryExecModeCacheDescribe",
  "describe_exec": "pgx.QueryExecModeDescribeExec",
  "exec": "pgx.QueryExecModeExec",
  "simple_protocol": "pgx.QueryExecModeSimpleProtocol"
}
```

Invalid values must fail startup or runner validation before a benchmark result
is treated as evidence.

Every Identity HTTP benchmark report and Identity phase matrix report must make
the active mode visible under the database profile.

## Acceptance Criteria

- Focused Go tests cover default, valid, and invalid
  `SESSION_DB_QUERY_EXEC_MODE` parsing.
- Focused Node tests prove the HTTP benchmark runner passes
  `SESSION_DB_QUERY_EXEC_MODE` to gateway processes and records it in
  `gatewayDatabaseProfile`.
- Focused Node tests prove the phase matrix runner forwards
  `--session-db-query-exec-mode` to child benchmark cases and records it in
  target/case profiles.
- A small Docker-isolated smoke run compares the default `cache_statement`
  profile against at least one PgBouncer-oriented alternative.
- No runtime default is changed unless the isolated data improves both max
  phase P99 and pool acquire pressure.
- `npm run verify:structure`, `npm run quality`, `git diff --check`, generated
  evidence secret scan, and Docker residual container check pass before commit.

## Rollback

Remove the query exec mode profile switch, the benchmark pass-through fields,
the focused tests, and this evidence slice. Because the default remains
`cache_statement`, rollback does not change the current runtime behavior.
