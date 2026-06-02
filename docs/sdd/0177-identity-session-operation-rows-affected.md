# SDD 0177: Identity Session Operation Rows Affected

## Problem

P78-P85 proved that the remaining Identity write bottleneck is dominated by
gateway-local pool acquire wait, especially in `revokeCycle.revokeOwnSession`.
The diagnostics can now split operation time into pool acquire and database
execute time, but they cannot yet say whether a write operation actually
affected rows.

That gap matters for revoke tuning. A slow `revokeOwnSession` that deletes one
row every time has a different next action than a slow revoke path that often
executes but affects zero rows. The system needs row-impact attribution before
changing revoke SQL, indexes, worker counts, or write scheduling.

## Source Requirement References

- Root requirements: Identity remains the shared access boundary for teacher,
  student, remote command, teaching archive, research conversation, knowledge,
  and Agent Harness flows.
- SDD 0169: operation-level database timing attribution is required before
  tuning write hot paths.
- SDD 0170: phase matrix summaries must keep pool-pressure signals visible.
- SDD 0175 and SDD 0176: recent config probes did not justify changing runtime
  defaults.

## Scope

In scope:

- Record `rowsAffectedCount`, `rowsAffected`, and `averageRowsAffected` for
  session write operations.
- Propagate row-impact fields through:
  - Identity gateway session DB diagnostics
  - Identity HTTP benchmark phase diagnostics
  - Identity phase matrix operation summaries
  - System Identity phase summaries
- Keep older reports without row-impact fields parseable.
- Run a small Docker-isolated smoke to prove the fields reach
  `revokeCycle.revokeOwnSession`.

Out of scope:

- Changing revoke semantics from hard delete to soft revoke.
- Changing Identity HTTP, auth, refresh, revoke, student app, remote command, or
  root workflow contracts.
- Changing SQL/indexes, pool sizes, worker counts, PgBouncer limits, PostgreSQL
  limits, write concurrency defaults, or ingress routing.
- Adding model, training, OCR, RAG, vector, embedding, Redis, or queue
  dependencies.

## Contracts

Session operation diagnostics may include:

```json
{
  "rowsAffectedCount": 256,
  "rowsAffected": 256,
  "averageRowsAffected": 1
}
```

Definitions:

- `rowsAffectedCount`: number of write executions where the DB command tag was
  observed.
- `rowsAffected`: total affected rows across those executions.
- `averageRowsAffected`: `rowsAffected / rowsAffectedCount`.

When row-impact data is absent, report parsers must keep working and must not
invent false values.

## Acceptance Criteria

- Focused Go tests fail before implementation because session operation timing
  stats do not expose rows affected.
- Focused httpbench tests fail before implementation because phase diagnostics
  deltas do not carry row-impact fields.
- Focused phase-matrix/system-summary Node tests fail before implementation
  because operation summaries do not preserve row-impact fields.
- After implementation, the focused tests pass.
- A Docker-isolated Identity phase smoke records row-impact fields for
  `revokeCycle.revokeOwnSession`.
- `npm run verify:structure`, `npm run quality`, `git diff --check`, generated
  evidence secret scan, and Docker residual container check pass before commit.

## Rollback

Remove the row-impact fields from platform diagnostics, HTTP benchmark deltas,
phase matrix summaries, system summaries, tests, and this evidence slice. The
runtime behavior and database semantics remain unchanged.
