# SDD 0196: Production 10k Effective Pressure Gate

## Problem

The sustained mixed workload scale-up runner can accept custom target-bearing
steps. A caller can therefore name a step `target-10k` and attach
`targetReadWriteRps=10000` while using tiny concurrency and operation counts.

That creates weak evidence. The report correctly fails when measured throughput
is below 10k, but it still says the target was attempted. For whole-system
capacity work, an attempted production 10k step must mean the system was driven
with enough client pressure to make the result meaningful.

## Scope

- Add a production 10k effective-pressure gate to the scale-up runner.
- Keep the standard profile unchanged for fast local evidence.
- Require target-bearing production 10k steps to meet minimum concurrency and
  operation floors before they count as target attempts.
- Include target pressure findings in reports so Root SLO and capacity reviews
  can explain why a run is not claimable.

## Non-Goals

- Claiming production 10k RPS in this slice.
- Changing root requirements.
- Adding training, vector database, OCR, vLLM, SFT, RL, Mem0, or Milvus
  dependencies.

## Contract

For `scaleProfile=production10k`, any step whose target is at or above the
configured `targetReadWriteRps` must pass these effective-pressure floors:

- Identity concurrency: `ceil(targetReadWriteRps / 1000) * 8`
- Conversation concurrency: `ceil(targetReadWriteRps / 1000) * 32`
- Teaching concurrency: `ceil(targetReadWriteRps / 1000) * 8`
- Each workflow operation count: at least `concurrency * 2`

For the 10k target this means:

```json
{
  "identityConcurrency": 80,
  "identityOperations": 160,
  "conversationConcurrency": 320,
  "conversationOperations": 640,
  "teachingConcurrency": 80,
  "teachingOperations": 160
}
```

If a target step is below the floor:

- The runner must fail validation before workload execution when the target is
  required.
- The report builder must classify the target as `INVALID_PRESSURE` when it is
  asked to summarize such evidence.
- The next action must tell the operator to rerun with the full production 10k
  ladder or a custom step that meets the same floors.

## Acceptance Criteria

- `production10k` default ladder remains the authoritative target ladder and
  its `target-10k` step satisfies the effective-pressure floor.
- A custom `target-10k:2:4:4:8:2:4:10000` step fails validation before any
  benchmark process runs when `--require-target-read-write-rps true`.
- Rollup reports expose target pressure findings and do not call an
  under-pressured target step a valid attempt.
- Existing standard scale-up tests and quality gates stay green.

## Rollback

Remove the effective-pressure validation and report fields. The runner will
return to treating any target-bearing step as an attempted target, which is
acceptable for exploratory debugging but not for production 10k claims.
