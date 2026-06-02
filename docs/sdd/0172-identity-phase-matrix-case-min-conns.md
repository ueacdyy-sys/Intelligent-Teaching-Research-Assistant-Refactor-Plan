# SDD 0172: Identity Phase Matrix Case Min Connections

## Problem

P80 exposed `SESSION_DB_MIN_CONNS` and showed that `minConns=8` did not improve
the paired 128-concurrency smoke when compared with a separate `minConns=0`
run. The comparison was useful, but each value required a separate matrix
orchestration and Docker reset. That makes future tuning noisier than necessary
because runner setup, warm-up, and host timing can vary between runs.

The Identity phase matrix needs case-scoped minimum session DB connections so a
single managed run can compare warm-pool and control shapes under the same
orchestration.

## Source Requirement References

- Root requirements: Identity remains the shared access boundary for teacher,
  student, remote command, teaching archive, research conversation, knowledge,
  and Agent Harness flows.
- SDD 0170: phase matrix reports must surface operation-level pool pressure.
- SDD 0171: `SESSION_DB_MIN_CONNS` is benchmark/runtime-profile evidence only
  and defaults to `0`.
- P80 report: do not promote `minConns=8`; run a paired matrix that varies pool
  size, gateway count, and min connections together.

## Scope

In scope:

- Keep the existing 8-field compact case spec working.
- Add a 9-field compact case spec with per-case `sessionDbMinConns`.
- Pass the case-scoped min connections to each child Identity HTTP benchmark.
- Record the per-case min connection profile in matrix case summaries.
- Reject case-scoped min connections greater than that case's max connections.

Out of scope:

- Changing Identity runtime defaults, SQL, session semantics, PgBouncer limits,
  PostgreSQL limits, or write concurrency.
- Claiming a new full-system concurrency ceiling from a narrow matrix.
- Adding Redis, model/training/OCR/RAG/vector/embedding dependencies.

## Contracts

Legacy 8-field case specs continue to use the global
`--session-db-min-conns` value:

```text
name:gatewayCount:sessionDbMaxConns:ingressCount:clientMaxConnsPerHost:clientWarmConnectionsPerHost:ingressMaxConnsPerHost:ingressWarmConnectionsPerHost
```

New 9-field case specs set min connections per case:

```text
name:gatewayCount:sessionDbMaxConns:sessionDbMinConns:ingressCount:clientMaxConnsPerHost:clientWarmConnectionsPerHost:ingressMaxConnsPerHost:ingressWarmConnectionsPerHost
```

Matrix case config:

```json
{
  "sessionDbMaxConnsPerWorker": 8,
  "sessionDbMaxConnsTotal": 16,
  "sessionDbMinConnsPerWorker": 4,
  "sessionDbMinConnsTotal": 8
}
```

Matrix target profile:

```json
{
  "caseScopedSessionDbMinConns": true,
  "sessionDbMinConnsPerWorkerValues": [0, 8]
}
```

## Acceptance Criteria

- A focused Node test proves legacy 8-field cases still inherit the global
  `--session-db-min-conns`.
- A focused Node test proves 9-field cases pass per-case min connections to
  child benchmark args and case summaries.
- A focused Node test proves `sessionDbMinConns > sessionDbMaxConns` is rejected
  before workload execution.
- A real paired smoke compares `minConns=0` and `minConns=8` in one managed
  matrix run.
- Focused tests, `npm run verify:structure`, `npm run quality`, and
  `git diff --check` pass.

## Rollback

Remove 9-field case parsing and keep the P80 global `--session-db-min-conns`
behavior. Existing reports and child benchmark fields remain parseable.
