# SDD 0141: System Sustained Mixed Workload Scale-Up Runner

## Problem

SDD 0140 added repeated five-slice sustained smoke evidence, but a two-sample
smoke run still cannot answer where the whole-system mixed workload starts to
degrade as load rises. The capacity audit now names the next evidence gap as
`SUSTAINED_MIXED_WORKLOAD_SCALE_UP`.

The refactor needs a small scale-up harness that runs several sustained mixed
workload steps under one managed Docker database setup, records the highest
passed step, records the first blocked step, and keeps any ultra-concurrency
promotion blocked until root workflow coverage, cross-module diagnostics, and
root SLO review exist.

## Source Requirement References

- Root requirement: refactor the whole system around the immutable product
  requirements; module-by-module work is only the delivery order.
- Root requirement: performance evidence must cover teaching and research
  workflows together rather than isolated vanity endpoints.
- SDD 0136: full-system ultra-concurrency requires mixed workload evidence,
  sustained evidence, root workflow coverage, cross-module diagnostics, and
  promotion review.
- SDD 0139 and SDD 0140: Teaching Archive remains part of every whole-system
  mixed workload sample.
- Baseline runtime must not add model, OCR, RAG, vector, embedding, training, or
  third-party benchmark dependencies.

## Scope

In scope:

- Add `tools/run-system-sustained-mixed-workload-scaleup.mjs`.
- Run multiple sustained mixed workload steps sequentially under one Docker
  setup and cleanup.
- Reuse SDD 0140's sustained runner for each step, with isolated per-step and
  per-sample report paths.
- Stop on the first failed or guardrail-blocked step by default.
- Record max P95, max P99, P99 drift, total errors, highest passed step, and
  first blocked step.
- Add an npm script and capacity-audit classification for scale-up evidence.
- Keep database URLs and `ueacd` masked in orchestration output.

Out of scope:

- Adding the live scale-up runner to `npm test` or `npm run quality`.
- Claiming production ultra-concurrency from the default small scale-up profile.
- Replacing Local Go, WSL Go, or Docker Go conversation load-generator
  decisions.
- Adding model, OCR, RAG, vector, embedding, training, or external load-test
  dependencies.

## Contracts

- `npm run bench:system-sustained-mixed-workload:scaleup` runs the default
  sustained scale-up profile.
- The runner writes
  `reports/system-sustained-mixed-workload-scaleup.current.json`.
- The rollup uses `workloadType=SUSTAINED_MIXED_WORKLOAD_SCALE_UP` and
  `benchmarkKind=system_sustained_mixed_workload_scale_up`.
- `--steps` uses compact
  `name:identityConcurrency:identityOperations:conversationConcurrency:conversationOperations`
  entries separated by commas; Teaching Archive inherits identity load unless
  the step appends `:teachingConcurrency:teachingOperations`.
- `--samples` controls repeated sustained samples per scale-up step.
- `--max-p99-ms` and `--max-p99-drift-ms` are guardrails for stopping scale-up,
  not production SLOs.
- Managed Docker performs `perf:identity-session:reset`, then `up`, and a final
  `reset` by default.

## Acceptance Criteria

- Focused tests prove kebab-case parsing.
- Focused tests prove per-step sustained report paths and options are isolated.
- Focused tests prove all-passed steps produce a passed scale-up report.
- Focused tests prove default stop-on-failure behavior for failed steps.
- Focused tests prove default stop-on-failure behavior for guardrail-blocked
  steps.
- Focused tests prove `--stop-on-failure false` continues later steps while the
  rollup remains failed.
- Focused tests prove managed Docker setup failure skips steps and masks
  secrets.
- Capacity audit tests prove scale-up evidence removes only the scale-up gap,
  while root workflow, cross-module diagnostics, and SLO review remain required.
- `node --check tools/run-system-sustained-mixed-workload-scaleup.mjs` passes.
- `node --test tools/run-system-sustained-mixed-workload-scaleup.test.mjs` passes.
- `npm run test:tools` and `npm run quality` pass.

## Rollback

Remove the scale-up runner, focused tests, package script, generated scale-up
reports, registry entry, capacity audit changes, and this SDD. The single
sustained smoke runner from SDD 0140 remains usable.

## Observability And Performance Evidence

The scale-up rollup records:

- configured, executed, passed, blocked, and first-blocked step counts;
- per-step identity, conversation, and Teaching Archive concurrency;
- per-step sample count, total errors, max P95/P99, and P99 drift;
- guardrail findings for status, zero errors, max P99, and P99 drift;
- managed Docker setup and cleanup command results;
- highest passed step and first blocked step;
- a next action that keeps scale-up evidence separate from production capacity
  promotion.
