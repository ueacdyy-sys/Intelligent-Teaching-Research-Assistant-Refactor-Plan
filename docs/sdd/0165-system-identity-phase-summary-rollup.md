# SDD 0165: System Identity Phase Summary Rollup

## Problem

P71 showed that mixed workload system P99 is dominated by the Identity workload
at `mixed800` and `mixed1600` across local, WSL, and Docker Conversation
loadgen placement. The Identity child report already exposes phase-level
latency for `passwordLogin`, `principalLookup`, `refreshRotation`, and
`revokeCycle`, including `revokeCycle.stepLatencyAttribution`.

The system mixed workload rollup only keeps the maximum Identity P95/P99 and
RPS. Sustained and scale-up reports therefore require opening the child
Identity JSON by hand to understand which phase owns the system P99. That slows
root-cause analysis and increases the risk of tuning the wrong component.

## Scope

In scope:

- Add a bounded Identity phase summary to system mixed workload
  `identity_http.summary`.
- Preserve the phase summary through sustained mixed workload sample rollups.
- Merge the phase summary through sustained scale-up step rollups.
- Preserve existing report compatibility when older child reports do not
  include phase data.

Out of scope:

- Changing Identity gateway behavior, SQL, ingress, database pools, or write
  limiter defaults.
- Changing benchmark workload shape or capacity guardrails.
- Claiming a new capacity limit.
- Enabling model, OCR, RAG, vector, embedding, training, or other heavy
  dependencies.

## Contracts

For `identity_http`, system mixed workload summaries include:

```json
{
  "summary": {
    "dominantPhase": "revokeCycle",
    "dominantPhaseP99Ms": 646.11,
    "phases": {
      "passwordLogin": {
        "errors": 0,
        "p95Ms": 524.26,
        "p99Ms": 588.36,
        "rps": 3867.95
      },
      "revokeCycle": {
        "errors": 0,
        "p95Ms": 616.17,
        "p99Ms": 646.11,
        "rps": 2624.07,
        "slowestStep": "revoke",
        "slowestStepP99Ms": 377.23
      }
    }
  }
}
```

Missing phase data remains absent or `null`; older reports remain parseable.

## Acceptance Criteria

- System mixed workload tests prove Identity phase summaries include per-phase
  P95/P99/RPS/errors and dominant phase attribution.
- Sustained mixed workload tests prove Identity phase summary survives sample
  rollup.
- Scale-up tests prove repeated sample summaries merge without dropping the
  dominant phase signal.
- Focused Node tests, `npm run verify:structure`, `npm run quality`, and
  `git diff --check` pass.

## Rollback

Remove the Identity phase summary fields from the system mixed, sustained, and
scale-up summaries. Child Identity benchmark reports remain unchanged.
