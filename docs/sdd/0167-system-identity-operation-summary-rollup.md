# SDD 0167: System Identity Operation Summary Rollup

## Problem

P72 made the system mixed workload reports identify the slowest Identity phase.
P73 and P74 then showed that the current `mixed1600` limit is still dominated
by Identity tail latency, especially `revokeCycle`.

The Identity child benchmark already records database session operation
diagnostics per phase under
`gatewayDatabasePhaseDiagnostics.*.delta.sessionOperations`. Those diagnostics
separate `saveSession` from `revokeOwnSession`, but the system mixed,
sustained, and scale-up reports currently drop that operation-level evidence.
That forces every bottleneck investigation to reopen child JSON files and makes
it too easy to tune worker, pool, or ingress configuration without proving which
write operation is slow.

## Scope

In scope:

- Roll per-phase Identity `sessionOperations` into system mixed workload
  `identity_http.summary.phases`.
- Preserve `slowestSessionOperation` and
  `slowestSessionOperationAverageElapsedMs` for each Identity phase.
- Merge operation counts and elapsed totals across sustained scale-up samples,
  recomputing averages from totals.
- Keep older reports parseable when child operation diagnostics are absent.

Out of scope:

- Changing Identity gateway runtime behavior, session SQL, write concurrency,
  ingress worker count, connection pools, or PgBouncer settings.
- Running a new capacity promotion or raising root SLO claims.
- Enabling model, OCR, RAG, vector, embedding, training, or other heavy
  dependencies.

## Contracts

For `identity_http`, system summaries may include operation-level diagnostics:

```json
{
  "summary": {
    "phases": {
      "revokeCycle": {
        "errors": 0,
        "p95Ms": 616.17,
        "p99Ms": 646.11,
        "rps": 2624.07,
        "slowestStep": "revoke",
        "slowestStepP99Ms": 377.23,
        "sessionOperations": {
          "revokeOwnSession": {
            "count": 3200,
            "totalElapsedMs": 974017.64,
            "averageElapsedMs": 304.38
          },
          "saveSession": {
            "count": 3200,
            "totalElapsedMs": 760990.69,
            "averageElapsedMs": 237.81
          }
        },
        "slowestSessionOperation": "revokeOwnSession",
        "slowestSessionOperationAverageElapsedMs": 304.38
      }
    }
  }
}
```

Scale-up merge behavior:

- `count`: sum.
- `totalElapsedMs`: sum and round to two decimal places.
- `averageElapsedMs`: recompute from merged total and count.
- `slowestSessionOperation`: operation with the largest merged average.
- Phase P95/P99/RPS/error behavior stays unchanged from SDD 0165.

## Acceptance Criteria

- System mixed workload tests prove child operation diagnostics appear in the
  Identity phase summary.
- Sustained workload tests prove operation summaries survive sample reports.
- Scale-up tests prove operation summaries merge counts, totals, averages, and
  slowest-operation attribution.
- Focused helper tests prove the rollup works directly and remains compatible
  with existing phase summary fields.
- Focused Node tests, `npm run verify:structure`, `npm run quality`, and
  `git diff --check` pass.

## Rollback

Remove operation summary fields from the system Identity phase summary helper
and stop passing `gatewayDatabasePhaseDiagnostics` into the system mixed
workload summarizer. Child Identity benchmark reports remain unchanged.
