# P75 System Identity Operation Summary Rollup

## Context

P74 ended with a narrow next action: gather direct operation-level evidence for
Identity session writes before changing worker, pool, or write-concurrency
limits again. The child Identity benchmark already emits
`gatewayDatabasePhaseDiagnostics.*.delta.sessionOperations`, but the system
mixed, sustained, and scale-up reports did not surface those fields.

P75 is an observability change. It does not change the benchmark workload,
Identity gateway behavior, SQL, ingress, PgBouncer, or default performance
configuration.

## SDD

- `docs/sdd/0167-system-identity-operation-summary-rollup.md`

## Implementation

- `tools/system-identity-phase-summary.mjs` now accepts child
  `gatewayDatabasePhaseDiagnostics` and rolls phase `sessionOperations` into the
  system Identity phase summary.
- Scale-up merges now sum operation counts and totals, then recompute
  `averageElapsedMs`.
- `tools/run-system-mixed-workload-benchmark.mjs` passes the child diagnostics
  into the shared Identity phase summary helper.
- Focused tests cover mixed, sustained, scale-up, and helper-level behavior.

## Evidence From Existing P74 Child Report

Source:

- `reports/system-sustained-mixed-workload-scaleup.p74-identity-expires-brin-mixed1600.1-mixed1600.1.identity-http.json`

Parsed with the P75 helper:

| Phase | Operation | Count | Total elapsed ms | Average elapsed ms |
|---|---:|---:|---:|---:|
| `passwordLogin` | `saveSession` | 3200 | 989030.61 | 309.07 |
| `revokeCycle` | `revokeOwnSession` | 3200 | 974017.64 | 304.38 |
| `revokeCycle` | `saveSession` | 3200 | 760990.69 | 237.81 |

The same parsed summary keeps `revokeCycle` as the dominant Identity phase with
P99 `685.19ms`, `slowestStep=revoke`, and
`slowestSessionOperation=revokeOwnSession`.

## TDD Evidence

Focused tests:

```text
node --test tools\system-identity-phase-summary.test.mjs tools\run-system-mixed-workload-benchmark.test.mjs tools\run-system-sustained-mixed-workload.test.mjs tools\run-system-sustained-mixed-workload-scaleup.test.mjs
```

Result: passed, 30 tests.

## Interpretation

- P75 makes the system reports directly show which Identity session write
  operation dominates a slow phase.
- The existing P74 evidence points at session write latency inside both
  `passwordLogin.saveSession` and `revokeCycle.revokeOwnSession`.
- This does not prove a new capacity limit and does not justify any root SLO or
  ultra-concurrency claim.
- The next performance change should target the Identity session write path
  with a narrow hypothesis and a same-run benchmark comparison.

## Next Action

Continue with a focused Identity session write-path optimization. Candidate
areas to prove before changing defaults:

- reduce unnecessary transaction work in `saveSession`;
- reduce revoke path elapsed time for `revokeOwnSession`;
- verify whether operation latency is dominated by lock contention, index
  maintenance, or connection-pool wait under `mixed1600`.
