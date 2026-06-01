# SDD 0140: System Sustained Mixed Workload Runner

## Problem

SDD 0137 and SDD 0138 added truthful five-slice mixed workload smoke and ladder
evidence. Those reports prove concurrent execution and staged load, but they
still do not show whether the whole system remains stable across repeated
mixed workload samples.

The capacity audit now calls out the next missing evidence explicitly:
`SUSTAINED_MIXED_WORKLOAD_PROFILE`. The refactor needs a small sustained
runner that repeats the same five root slices under one Docker database setup,
records P99 drift and per-sample failures, and still blocks any production
ultra-concurrency promotion.

## Source Requirement References

- Root requirement: the project is a whole-system refactor centered on the
  immutable product requirements; modules are delivery slices only.
- Root requirement: teaching, research, knowledge, workflow, plugin, and worker
  evidence must support the full application rather than isolated benchmarks.
- SDD 0136: full-system ultra-concurrency requires sustained mixed workload,
  root workflow coverage, cross-module diagnostics, and promotion review.
- SDD 0139: Teaching Archive must remain part of mixed workload evidence.
- Baseline runtime must not add model, OCR, RAG, vector, embedding, training, or
  external load-test dependencies.

## Scope

In scope:

- Add `tools/run-system-sustained-mixed-workload.mjs`.
- Run multiple five-slice mixed workload samples sequentially under one managed
  Docker setup.
- Write one rollup report and isolated per-sample child reports.
- Record configured, executed, passed, failed, first-failed sample counts,
  max P95/P99, total errors, and P99 drift from first to last passed sample.
- Keep Docker setup and cleanup evidence masked.
- Add a package script for manual sustained smoke runs.

Out of scope:

- Adding the live sustained runner to `npm test` or `npm run quality`.
- Promoting sustained smoke as production capacity.
- Replacing WSL/Local Go conversation load-generator decisions.
- Adding model, OCR, RAG, vector, embedding, training, or third-party benchmark
  dependencies.

## Contracts

- `npm run bench:system-sustained-mixed-workload` runs the default sustained
  smoke profile.
- The runner uses `workloadType=SUSTAINED_MIXED_WORKLOAD` and
  `benchmarkKind=system_sustained_mixed_workload`.
- `--samples` controls repeated sample count.
- `--sample-interval-ms` controls the delay between completed samples.
- Managed Docker performs `perf:identity-session:reset`, then `up`, and a final
  `reset` by default.
- Setup failure skips samples and still records cleanup.
- Sample reports reuse the SDD 0137 mixed workload runner, so every sample keeps
  the five root slices: identity, conversation, Teaching Archive, knowledge,
  and AI worker admission.

## Acceptance Criteria

- Focused tests prove kebab-case parsing.
- Focused tests prove isolated per-sample report paths and five-slice options.
- Focused tests prove all samples passing produces a passed sustained report.
- Focused tests prove default stop-on-failure behavior.
- Focused tests prove `--stop-on-failure false` continues later samples while
  the rollup remains failed.
- Focused tests prove managed Docker setup failure skips samples and masks
  secrets.
- Focused tests prove P99 drift is summarized.
- `node --check tools/run-system-sustained-mixed-workload.mjs` passes.
- `node --test tools/run-system-sustained-mixed-workload.test.mjs` passes.
- `npm run test:tools` and `npm run quality` pass.

## Rollback

Remove the sustained runner, focused tests, package script, generated sustained
reports, registry entry if added, and this SDD. The single-sample mixed smoke
and ladder runners remain usable.

## Observability And Performance Evidence

The sustained rollup records:

- sample count and stop-on-failure behavior;
- per-sample workload status, errors, P95, and P99;
- maximum P95/P99 across executed samples;
- P99 drift between first and last passed sample;
- managed Docker setup and cleanup results;
- next action that explicitly keeps sustained smoke separate from full-system
  capacity promotion.
