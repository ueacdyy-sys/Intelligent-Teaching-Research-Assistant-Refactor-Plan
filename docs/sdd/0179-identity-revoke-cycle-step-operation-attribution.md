# SDD 0179: Identity Revoke Cycle Step Operation Attribution

## Problem

P86 proved that `revokeOwnSession` affects one row per call, so the slow path is
not an empty revoke. P87 then proved that a low write-concurrency profile can
move pressure from the pgx pool into the application write limiter.

The remaining gap is step attribution inside `revokeCycle`. The phase currently
records HTTP step latency for `login`, `revoke`, and `revokedPrincipalLookup`,
and separately records phase-level session operation and write-limiter deltas.
Those signals are still disconnected in the report, so a reader cannot quickly
see which step owns `saveSession`, which step owns `revokeOwnSession`, and
whether the revoked-token lookup still reached the database.

Without this attribution, the next performance decision could mistake benchmark
scenario write amplification for a generic PostgreSQL or worker-count problem.

## Source Requirement References

- Root requirements: Identity remains the shared access boundary for teacher,
  student, remote command, archive, research conversation, knowledge, and Agent
  Harness flows.
- SDD 0147: `revokeCycle` step latency must stay visible because it is a
  recurrent Identity tail-latency contributor.
- SDD 0157-0158: revoked-token denial should avoid unnecessary DB lookup when
  the deny cache and bearer affinity are effective.
- SDD 0169-0170: operation-level pool pressure must be visible before tuning.
- SDD 0177-0178: row impact and write-limiter pressure are known, but step
  ownership inside the phase is still too coarse.

## Scope

In scope:

- Add `revokeCycle` step-to-session-operation attribution to raw httpbench
  reports without adding diagnostics calls inside the hot concurrent loop.
- Preserve that attribution in Identity phase matrix case summaries.
- Preserve and merge that attribution in system Identity phase summaries.
- Mark expected-but-unobserved session operations so a revoked lookup cache hit
  is visible as "no DB session operation observed" instead of being confused
  with missing diagnostics.
- Keep older reports parseable when the attribution field is absent.

Out of scope:

- Changing login, revoke, revoked-token lookup, or session persistence
  semantics.
- Enabling `SESSION_DB_WRITE_CONCURRENCY` by default.
- Changing SQL/indexes, worker counts, pool sizes, PgBouncer limits,
  PostgreSQL limits, or ingress routing.
- Adding Redis, queue, model, training, OCR, RAG, vector, embedding, or other
  heavy dependencies.

## Contracts

`revokeCycle` phase reports may include:

```json
{
  "stepOperationAttribution": {
    "login": {
      "stepLatencyMs": { "p99": 40 },
      "expectedSessionOperations": ["saveSession"],
      "sessionOperations": {
        "saveSession": { "count": 256, "averageElapsedMs": 19.45 }
      },
      "writeLimiterOperations": {
        "saveSession": { "acquireWaitTimeMs": 10722.78 }
      }
    },
    "revoke": {
      "expectedSessionOperations": ["revokeOwnSession"],
      "sessionOperations": {
        "revokeOwnSession": { "count": 256, "averageRowsAffected": 1 }
      }
    },
    "revokedPrincipalLookup": {
      "expectedSessionOperations": ["getPrincipalByAccessToken"],
      "missingSessionOperations": ["getPrincipalByAccessToken"]
    }
  }
}
```

Definitions:

- `expectedSessionOperations`: deterministic operation names tied to the
  benchmark step contract.
- `missingSessionOperations`: expected operations that did not appear in the
  phase delta. For `revokedPrincipalLookup`, this usually means the denial path
  avoided the DB lookup.
- `sessionOperations`: observed operation deltas from phase diagnostics.
- `writeLimiterOperations`: observed per-operation write-limiter deltas when a
  write limiter was enabled.

## Acceptance Criteria

- Focused Go tests fail before implementation because `revokeCycle` step
  operation attribution is absent from raw phase reports.
- Focused phase-matrix Node tests fail before implementation because summaries
  do not preserve step operation attribution.
- Focused system-summary Node tests fail before implementation because step
  operation attribution is not merged across reports.
- After implementation, the focused tests pass.
- A Docker-isolated Identity phase smoke records `revokeCycle` step operation
  attribution with `login.saveSession`, `revoke.revokeOwnSession`, and the
  revoked lookup DB-operation presence or absence.
- `npm run verify:structure`, `npm run quality`, `git diff --check`, generated
  evidence secret scan, and Docker residual container check pass before commit.

## Rollback

Remove the step operation attribution field, the summarizer propagation, tests,
and this evidence slice. Runtime behavior, database semantics, and performance
configuration remain unchanged.
