# SDD 0180: Identity Phase Matrix Case Write Concurrency

## Problem

P87 and P88 showed that `SESSION_DB_WRITE_CONCURRENCY=2` can move session write
pressure from the pgx pool into the application write limiter, and that the
largest wait in the measured profile belongs to `revokeCycle` writes. The
evidence is useful, but the next tuning step is still noisy because each write
concurrency value must be tested in a separate matrix run or by changing one
global option.

The Identity phase matrix needs case-scoped session DB write concurrency so a
single Docker-isolated matrix can compare `0`, `2`, `4`, and `8` under the same
orchestration shape before any runtime default is promoted.

## Source Requirement References

- Root requirements: Identity remains the shared access boundary for teacher,
  student, remote command, teaching archive, research conversation, knowledge,
  and Agent Harness flows.
- SDD 0172: compact case specs may vary connection shape per case while keeping
  older case specs compatible.
- SDD 0178: write-limiter pressure must be visible before tuning.
- SDD 0179: revoke-cycle step attribution identifies `saveSession` and
  `revokeOwnSession` as the measured write-pressure owners.

## Scope

In scope:

- Keep the existing 8-field and 9-field compact case specs working.
- Add a 10-field compact case spec with per-case
  `sessionDbWriteConcurrency`.
- Pass the case-scoped write concurrency to each child Identity HTTP benchmark.
- Record per-case write concurrency in matrix case summaries and target profile
  values.
- Reject write concurrency above that case's max session DB connections before
  the workload starts.

Out of scope:

- Changing Identity runtime defaults, SQL, session semantics, PgBouncer limits,
  PostgreSQL limits, or worker counts.
- Claiming a full-system concurrency ceiling from this narrow Identity matrix.
- Adding Redis, queue, model, training, OCR, RAG, vector, embedding, or other
  heavy dependencies.

## Contracts

Legacy 8-field case specs continue to inherit both global
`--session-db-min-conns` and global `--session-db-write-concurrency`:

```text
name:gatewayCount:sessionDbMaxConns:ingressCount:clientMaxConnsPerHost:clientWarmConnectionsPerHost:ingressMaxConnsPerHost:ingressWarmConnectionsPerHost
```

Existing 9-field case specs set min connections per case and continue to inherit
global write concurrency:

```text
name:gatewayCount:sessionDbMaxConns:sessionDbMinConns:ingressCount:clientMaxConnsPerHost:clientWarmConnectionsPerHost:ingressMaxConnsPerHost:ingressWarmConnectionsPerHost
```

New 10-field case specs set min connections and write concurrency per case:

```text
name:gatewayCount:sessionDbMaxConns:sessionDbMinConns:sessionDbWriteConcurrency:ingressCount:clientMaxConnsPerHost:clientWarmConnectionsPerHost:ingressMaxConnsPerHost:ingressWarmConnectionsPerHost
```

Matrix case config:

```json
{
  "sessionDbWriteConcurrencyPerWorker": 4,
  "sessionDbWriteConcurrencyTotal": 8
}
```

Matrix target profile:

```json
{
  "caseScopedSessionDbWriteConcurrency": true,
  "sessionDbWriteConcurrencyPerWorkerValues": [0, 2, 4, 8]
}
```

## Acceptance Criteria

- A focused Node test proves legacy 8-field cases inherit global write
  concurrency.
- A focused Node test proves 9-field min-connection cases still inherit global
  write concurrency.
- A focused Node test proves 10-field cases pass per-case write concurrency to
  child benchmark args and case summaries.
- A focused Node test proves `sessionDbWriteConcurrency > sessionDbMaxConns` is
  rejected before workload execution.
- A real Docker-isolated Identity phase smoke compares multiple write
  concurrency values in one managed matrix run.
- Focused tests, `npm run verify:structure`, `npm run quality`,
  `git diff --check`, generated evidence secret scan, and Docker residual
  container check pass before commit.

## Rollback

Remove 10-field case parsing and keep the global
`--session-db-write-concurrency` behavior. Existing 8-field and 9-field reports
remain parseable.
