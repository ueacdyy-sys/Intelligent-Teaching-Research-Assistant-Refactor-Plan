# SDD 0186: Standard High Sustained Scale-up

## Problem

The Root SLO promotion review originally required the sustained mixed workload
scale-up evidence to reach at least the standard `high` step. The scale-up
runner default used to stop at `low`, so the default evidence path could never
satisfy `promotion.sustained_scale_depth_sufficient` even when the machine
could pass a higher workload.

A controlled probe on this workspace showed that explicit `medium` and `high`
steps can pass with real read/write workload evidence. The runner should make
that depth the standard current evidence path instead of requiring operators to
remember a custom `--steps` string.

Later production10k evidence adds a stronger target-bearing path. A qualified
production target report can satisfy the Root SLO scale-depth gate even when it
is not named `high`, as long as it records target pressure, at least two
samples, zero errors, at least 10,000 read/write RPS, and max P99 within the
50 ms target.

## Source Requirement References

- Immutable root requirements: performance evidence must serve the whole
  teaching and research assistant.
- SDD 0181: production 10k read/write RPS requires measured sustained evidence.
- SDD 0183: scale-up reports expose read/write RPS fields.
- SDD 0184: CLI output exposes step-level read/write RPS.
- Root SLO policy: sustained mixed workload evidence must pass at least the
  `high` step, or a qualified target-bearing production report must pass the
  explicit 10k/50ms pressure gates.

## Scope

In scope:

- Extend the default sustained scale-up ladder to
  `smoke -> low -> medium -> high`.
- Keep the `high` step moderate and reproducible on the local Docker/Windows
  environment: identity 16/32, conversation 64/128, teaching 16/32.
- Add a focused test proving the default ladder includes `high`.
- Regenerate current scale-up, cross-module diagnostics, Root SLO, capacity,
  and performance registry reports from the standard path.
- Allow Root SLO review to accept a qualified production target report without
  requiring another standard ladder run.

Out of scope:

- Increasing the production read/write target.
- Adding model, OCR, RAG, vector, embedding, training, Mem0, Milvus, vLLM,
  SFT, RL, quantization, or load-generation dependencies.
- Claiming 10 ms P99 support from a report that only proves the 50 ms target.
- Re-running broad performance probes when the latest qualified production
  target report already answers the current acceptance question.

## Contracts

Default scale-up steps:

```text
smoke:2:4:8:16:2:4
low:4:8:16:32:4:8
medium:8:16:32:64:8:16
high:16:32:64:128:16:32
```

The `high` step remains evidence depth, not a production-capacity claim. The
Root SLO review still decides whether the measured read/write RPS and all root
workflow evidence support promotion.

Qualified production target evidence may also satisfy the scale-depth gate when
all checks below are true:

```text
status=PASSED
throughputTarget.status=MET
throughputTarget.targetReadWriteRps >= 10000
summary.highestPassedReadWriteRps >= 10000
scaleGuardrails.maxP99Ms <= 50
summary.maxP99Ms <= 50
summary.totalErrors = 0
summary.orchestrationErrors = 0
concurrencyProfile.samplesPerStep >= 2
throughputTarget.pressure.status=PASSED
```

## Acceptance Criteria

- The default scale-up runner builds `smoke`, `low`, `medium`, and `high`
  steps.
- Focused Node tests pass for the scale-up runner.
- `npm run bench:system-sustained-mixed-workload:scaleup` produces current
  evidence with `highestPassedStep: high` or records the first real blocker.
- Root SLO review can also pass when current production target evidence is
  qualified by the explicit 10k/50ms checks above.
- Root SLO review consumes the regenerated current evidence.
- `npm run verify:structure`, relevant audits, `npm run quality`, and
  `git diff --check` pass.
- Docker has no residual running containers after verification.

## Rollback

Return the default `steps` string to `smoke,low`, remove the focused default
ladder test and qualified-production-target acceptance branch, remove this SDD,
and regenerate the current reports. Root SLO will again block on missing `high`
sustained scale depth unless another policy accepts target-bearing production
evidence.
