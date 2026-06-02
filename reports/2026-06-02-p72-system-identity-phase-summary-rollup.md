# P72 System Identity Phase Summary Rollup

## Context

P71 showed that system mixed workload P99 is dominated by the Identity workload
at `mixed800` and `mixed1600`, regardless of whether the Conversation load
generator runs locally, in WSL, or in Docker.

P72 adds phase-level Identity attribution to the system mixed, sustained, and
scale-up rollups. This is an observability slice: it makes the next performance
target visible in the top-level reports, but it does not change service
behavior or promote a new capacity claim.

## SDD

- `docs/sdd/0165-system-identity-phase-summary-rollup.md`

## Implementation

- `tools/system-identity-phase-summary.mjs` summarizes Identity child benchmark
  phases into bounded top-level fields.
- `tools/run-system-mixed-workload-benchmark.mjs` now includes
  `identity_http.summary.phases`, `dominantPhase`, and
  `dominantPhaseP99Ms`.
- `tools/run-system-sustained-mixed-workload-scaleup.mjs` preserves and merges
  Identity phase summaries across samples and scale-up steps.
- Focused tests now assert that system mixed, sustained, and scale-up reports
  retain the dominant Identity phase signal.

## Results

All P72 benchmark runs used `manageDocker=true`, `dockerCleanup=reset`,
local Conversation loadgen, one sample per step, and the same database,
transport, and gateway settings as the matching P71 local profiles.

| Step | Status | Errors | System P99 ms | Identity P99 ms | Identity RPS | Dominant Identity phase | Dominant phase P99 ms | Slowest step | Slowest step P99 ms | Conversation P99 ms | Teaching P99 ms |
|---|---:|---:|---:|---:|---:|---|---:|---|---:|---:|---:|
| smoke | PASSED | 0 | 32 | 15.59 | 135.75 | passwordLogin | 15.59 | n/a | n/a | 20.8 | 32 |
| mixed1600 | PASSED | 0 | 702.06 | 702.06 | 2496.36 | revokeCycle | 702.06 | revoke | 402.66 | 238.44 | 509 |

## Evidence Files

- `reports/system-sustained-mixed-workload-scaleup.p72-identity-phase-summary-smoke.json`
- `reports/system-sustained-mixed-workload-scaleup.p72-identity-phase-summary-mixed1600.json`

Each top-level file has its per-step and child workload reports under the same
prefix.

## Verification

```text
node --test tools\run-system-mixed-workload-benchmark.test.mjs tools\run-system-sustained-mixed-workload.test.mjs tools\run-system-sustained-mixed-workload-scaleup.test.mjs
npm run verify:structure
npm run quality
git diff --check
P72 generated report secret scan
Docker residual container check
```

## Interpretation

- The rollup works: `identity_http.summary` now exposes the dominant phase in
  system reports without opening the child Identity JSON manually.
- At `mixed1600`, Identity still owns system max P99. The dominant phase is
  `revokeCycle`, and its slowest attributed step is `revoke`.
- The mixed1600 Identity child report also shows high pool acquire wait and
  session write operation latency in the report diagnostics. The next
  optimization should focus on the Identity revoke/session write path, not on
  Conversation loadgen placement.
- P72 does not prove higher capacity. It only improves the evidence chain for
  the next optimization slice.

## Next Action

Create the next SDD/TDD slice around Identity `revokeCycle` and session write
diagnostics. The target should distinguish database pool wait, write operation
time, and revoke-specific behavior before changing runtime limits.
