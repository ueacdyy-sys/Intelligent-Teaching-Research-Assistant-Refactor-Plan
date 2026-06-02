# SDD 0170: Identity Phase Matrix Operation Pool Pressure

## Problem

P78 proved that `revokeCycle.revokeOwnSession` can spend most of its elapsed
time waiting for a gateway-local pgx pool connection while the SQL execution
itself remains comparatively small. Earlier P73/P68 evidence also showed that
simple worker, pool, or write-limiter changes can fail to improve the whole
system and may consume PgBouncer headroom or move pressure to other modules.

The Identity phase matrix already keeps raw session operation timing fields,
but it does not compute operation-level pool-wait share or identify the phase
and operation most controlled by pool acquire time. That makes matrix reports
hard to use as a tuning guide.

## Source Requirement References

- Root requirements: Identity remains the shared access boundary for teacher,
  student, remote command, teaching archive, research conversation, knowledge,
  and Agent Harness flows.
- SDD 0161: write-concurrency stays benchmark-only and defaults to disabled.
- SDD 0167: system reports must surface Identity operation-level diagnostics.
- SDD 0169: measured session writes expose pool acquire and DB execute timing.
- P73/P68/P78 reports: configuration changes require evidence and must not be
  promoted from a single narrow pass.

## Scope

In scope:

- Add derived operation-level pool and DB execute share fields to Identity
  phase matrix summaries when measured child diagnostics are present.
- Identify each phase's slowest session operation by average elapsed time.
- Identify each phase's highest pool-wait-share operation.
- Identify each case's dominant pool-wait phase and operation.
- Keep older reports parseable when pool attribution fields are absent.

Out of scope:

- Changing Identity runtime defaults, token/session semantics, SQL, write
  concurrency, gateway count, PgBouncer limits, or PostgreSQL limits.
- Claiming a new concurrency ceiling or full-system ultra-concurrency support.
- Adding Redis, model/training/OCR/RAG/vector/embedding dependencies.

## Contracts

Identity phase matrix phase summaries may include:

```json
{
  "slowestSessionOperation": "revokeOwnSession",
  "slowestSessionOperationAverageElapsedMs": 24.25,
  "highestPoolAcquireShareOperation": "revokeOwnSession",
  "highestPoolAcquireShare": 0.86
}
```

Measured session operation entries may include:

```json
{
  "name": "revokeOwnSession",
  "count": 256,
  "averageElapsedMs": 24.25,
  "poolAcquireElapsedMs": 5366.55,
  "averagePoolAcquireElapsedMs": 20.96,
  "poolAcquireShare": 0.86,
  "dbExecuteElapsedMs": 836.08,
  "averageDbExecuteElapsedMs": 3.27,
  "dbExecuteShare": 0.13
}
```

Case summaries may include:

```json
{
  "dominantPoolWaitPhase": "revokeCycle",
  "dominantPoolWaitOperation": "revokeOwnSession",
  "dominantPoolAcquireShare": 0.86
}
```

## Acceptance Criteria

- A focused Node test proves measured operation summaries include pool and DB
  execute shares.
- A focused Node test proves phase summaries identify slowest operation and
  highest pool-wait-share operation.
- A focused Node test proves case summaries identify the dominant pool-wait
  phase and operation.
- Older child reports without attribution fields remain parseable.
- Focused Node tests, `npm run verify:structure`, `npm run quality`, and
  `git diff --check` pass.

## Rollback

Remove the derived pool-pressure fields from the Identity phase matrix runner.
Child Identity HTTP benchmark reports and P78 operation timing fields remain
unchanged.
