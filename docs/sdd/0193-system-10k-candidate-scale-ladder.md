# SDD 0193: System 10k Candidate Scale Ladder

## Problem

The current sustained mixed workload scale-up runner proves a conservative
`high` step, but it does not explicitly configure or report a production 10k
candidate step. That makes the current standard-ladder RPS evidence easy to
misread as an absolute system limit, even though the runner never attempted a
10k target ladder.

The full-system production claim needs a stricter distinction:

- a standard quick scale-up ladder for routine evidence refreshes;
- a production 10k candidate ladder for Docker/WSL multi-worker runs;
- a machine-readable target verdict that says whether the 10k target was not
  configured, not attempted, attempted but missed, or met.

## Source Requirement References

- Immutable root requirements: performance claims must cover the whole teaching
  and research assistant, not one endpoint.
- SDD 0181: the root SLO promotion policy requires measured sustained
  read/write RPS at or above 10000.
- SDD 0184: operators must be able to see read/write RPS directly in scale-up
  evidence.
- Current Root SLO evidence blocks production promotion because measured
  read/write RPS is below 10000 and Identity tail latency remains too high.

## Scope

In scope:

- Add a `scaleProfile` option for the sustained mixed workload scale-up runner.
- Preserve the existing standard ladder as the default fast evidence path.
- Add a `production10k` ladder with explicit 3k, 5k, 8k, and 10k target steps.
- Apply production-oriented runtime defaults for the 10k profile:
  multi-gateway counts, unlogged session table persistence, larger hot-path DB
  pools, batched conversation writes, and identity ingress preconnection.
- Add `throughputTarget` evidence to the scale-up report.
- Carry target-attempt status into the Root SLO promotion review.

Out of scope:

- Running the production 10k load test in this slice.
- Claiming that the system currently supports production 10k RPS.
- Adding model, OCR, RAG, vector, embedding, training, Mem0, Milvus, vLLM, SFT,
  RL, or FP8 dependencies to the baseline.
- Weakening root requirements, quality gates, latency gates, or secret hygiene.

## Contracts

The scale-up runner accepts:

```text
--scale-profile production10k
```

When the production profile is selected and custom steps are not supplied, the
runner expands the ladder to:

```text
smoke -> low -> medium -> high -> target-3k -> target-5k -> target-8k -> target-10k
```

Scale-up reports include:

```json
{
  "scaleProfile": "production10k",
  "throughputTarget": {
    "targetReadWriteRps": 10000,
    "required": true,
    "configured": true,
    "attempted": true,
    "met": false,
    "status": "ATTEMPTED_NOT_MET",
    "shortfallRps": 800
  }
}
```

Root SLO promotion evidence includes:

```json
{
  "productionThroughput": {
    "targetReadWriteRps": 10000,
    "measuredReadWriteRps": 9200,
    "targetAttemptStatus": "ATTEMPTED_NOT_MET",
    "targetAttempted": true,
    "targetConfigured": true,
    "targetShortfallRps": 800
  }
}
```

## Acceptance Criteria

- Existing default scale-up behavior remains a four-step standard ladder.
- `--scale-profile production10k` builds the 3k/5k/8k/10k candidate ladder.
- The production profile records a required 10k read/write RPS target.
- Reports distinguish `NOT_CONFIGURED`, `NOT_ATTEMPTED`,
  `ATTEMPTED_NOT_MET`, and `MET`.
- A required target that is attempted below 10k marks the scale-up report
  failed.
- A required target only passes when measured read/write RPS reaches 10000.
- Root SLO promotion review carries target-attempt status into its production
  throughput evidence and blocker actual text.
- Focused runner and Root SLO tests pass.
- `npm run verify:structure`, `npm run quality`, and `git diff --check` pass.

## Rollback

Remove this SDD, the `scaleProfile` and `throughputTarget` runner additions, the
Root SLO target-attempt propagation, and the focused tests. The scale-up runner
returns to the standard ladder only, and Root SLO promotion can still block on
measured RPS but cannot explain whether the 10k target step was attempted.
