# SDD 0178: Identity Phase Write Limiter Pressure

## Problem

P25-P28 proved that `SESSION_DB_WRITE_CONCURRENCY` can move wait time from the
pgx pool into the application write limiter. P86 then proved that
`revokeCycle.revokeOwnSession` is not slow because it misses rows; it affects
one row per call and is still dominated by waiting.

The remaining diagnostic gap is phase attribution. Identity HTTP benchmark
reports can summarize whole-run write-limiter pressure, and phase diagnostics
can summarize pgx pool pressure, but the phase matrix cannot yet answer:

- which phase accumulated application write-slot wait;
- which session write operation accumulated that wait;
- whether a shaped profile improved DB pool wait by simply moving pressure into
  the write limiter during the same phase.

Without this, promoting or rejecting a write-concurrency profile is still too
coarse for the whole-system refactor.

## Source Requirement References

- Root requirements: Identity is the shared access boundary for teacher,
  student, remote command, teaching archive, research conversation, knowledge,
  and Agent Harness flows.
- SDD 0106-0108: write-concurrency scheduling must remain optional until queue
  pressure is observable.
- SDD 0169-0170: phase-level operation diagnostics must keep pool-pressure
  attribution visible.
- SDD 0177: row impact is normal, so the next tuning target is queue pressure
  and write-path shape, not revoke SQL miss rate.

## Scope

In scope:

- Add phase-level `writeLimiter` deltas to Identity gateway DB diagnostics.
- Attribute write-limiter acquire wait to session write operations by phase.
- Preserve the new fields in Identity phase matrix summaries.
- Preserve and merge the new fields in system Identity phase summaries.
- Keep older reports without `writeLimiter` fields parseable.
- Run a small Docker-isolated smoke with write concurrency enabled to prove the
  field path reaches the phase matrix.

Out of scope:

- Enabling `SESSION_DB_WRITE_CONCURRENCY` by default.
- Changing revoke/session semantics.
- Changing SQL/indexes, worker counts, pool sizes, PgBouncer limits,
  PostgreSQL limits, or ingress routing.
- Adding Redis, queue, model, training, OCR, RAG, vector, embedding, or other
  heavy dependencies.

## Contracts

Phase diagnostics may include:

```json
{
  "writeLimiter": {
    "enabledGateways": 2,
    "configuredLimitTotal": 4,
    "acquireCount": 256,
    "acquireWaitTimeMs": 512.5,
    "averageAcquireWaitTimeMs": 2,
    "operations": {
      "revokeOwnSession": {
        "acquireCount": 128,
        "acquireWaitTimeMs": 320,
        "averageAcquireWaitTimeMs": 2.5
      }
    }
  }
}
```

Definitions:

- `enabledGateways`: number of gateway workers with write limiter enabled in
  the after snapshot.
- `configuredLimitTotal`: summed write-slot limit across enabled gateways.
- `acquireCount`: write-slot acquisitions during the phase.
- `acquireWaitTimeMs`: cumulative write-slot wait during the phase.
- `averageAcquireWaitTimeMs`: `acquireWaitTimeMs / acquireCount`.

When limiter data is absent or disabled, summaries must omit phase limiter
fields rather than invent zero-pressure conclusions.

## Acceptance Criteria

- Focused Go tests fail before implementation because phase diagnostics do not
  expose write-limiter deltas.
- Focused phase-matrix Node tests fail before implementation because phase
  summaries do not preserve limiter pressure and dominant limiter operation.
- Focused system-summary Node tests fail before implementation because limiter
  totals are not preserved and merged.
- After implementation, the focused tests pass.
- A Docker-isolated Identity phase smoke with write concurrency enabled records
  phase-level write-limiter fields.
- `npm run verify:structure`, `npm run quality`, `git diff --check`, generated
  evidence secret scan, and Docker residual container check pass before commit.

## Rollback

Remove the phase-level write-limiter delta fields from Gateway diagnostics,
phase matrix summaries, system summaries, tests, and this evidence slice. The
runtime behavior and database semantics remain unchanged.
