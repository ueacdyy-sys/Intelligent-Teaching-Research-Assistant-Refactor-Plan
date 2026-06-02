# SDD 0184: Sustained Scale-up CLI Read Write RPS

## Problem

SDD 0183 adds auditable read/write RPS fields to sustained mixed workload and
scale-up reports. The JSON evidence now carries the value, but the scale-up
command-line summary still only prints concurrency, P99, drift, and errors.

That makes quick human review weaker than the machine-readable Root SLO review:
after each run, the operator must open JSON to see the measured read/write RPS.
For a long-running refactor with frequent reconnects, the terminal output should
show the most important throughput number directly.

## Source Requirement References

- Immutable root requirements: performance claims must be proven against the
  whole teaching and research assistant, not a single endpoint.
- SDD 0144: root SLO promotion review blocks unsupported full-system capacity
  claims.
- SDD 0181: production 10k read/write RPS requires measured sustained evidence.
- SDD 0183: sustained scale-up reports expose read/write RPS fields.

## Scope

In scope:

- Print `readWriteRps` in each sustained scale-up CLI step result.
- Preserve the existing JSON contract and Root SLO evidence extraction.
- Add focused formatter coverage so future changes do not hide RPS from the
  terminal summary.

Out of scope:

- Changing benchmark load, scale-up steps, or Root SLO promotion policy.
- Claiming current production 10k RPS support.
- Adding model, OCR, RAG, vector, embedding, training, or load-generation
  dependencies.

## Contracts

Scale-up terminal output includes the measured read/write RPS per step:

```text
- low PASSED/PASSED readWriteRps=1089.87 identity=4 conversation=16 teaching=4 ...
```

When a step has no read/write RPS evidence, the terminal output uses `n/a`
instead of inventing a value.

## Acceptance Criteria

- `formatSystemSustainedMixedWorkloadScaleUp` prints step-level
  `readWriteRps`.
- Existing sustained scale-up report fields remain unchanged.
- Focused Node tests for the scale-up runner pass.
- `npm run verify:structure`, relevant audits, `npm run quality`, and
  `git diff --check` pass.
- Docker has no residual running containers after verification.

## Rollback

Remove the CLI formatter change and its focused test assertion. JSON evidence
fields from SDD 0183 remain available, but operators must inspect report files
to see read/write RPS.
