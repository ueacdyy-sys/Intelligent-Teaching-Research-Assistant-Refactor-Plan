# SDD 0138: System Mixed Workload Ladder Runner

## Problem

SDD 0137 created a truthful mixed workload smoke runner. That proves concurrent
root-slice execution can start, run, report, and clean up. It still does not
show how the system behaves as load rises.

The refactor needs a small, repeatable ladder harness that can run multiple
mixed workload steps in order, stop on the first failed step, and preserve the
distinction between smoke evidence and a full-system capacity claim.

## Source Requirement References

- Root requirement: refactor the whole Intelligent Teaching Research Assistant;
  module-by-module is delivery order, not the final scope.
- Root requirement: capacity evidence must support teaching and research
  workflows, not isolated module vanity numbers.
- Root requirement: baseline dependencies remain small; no model, OCR, RAG,
  vector, embedding, training, or external benchmark dependency is allowed in
  the baseline.
- SDD 0136: full-system ultra-concurrency requires mixed workload evidence and
  promotion review against root workflow SLOs.
- SDD 0137: mixed smoke evidence is review input only.

## Scope

In scope:

- Add `tools/run-system-mixed-workload-ladder.mjs`.
- Run multiple `run-system-mixed-workload-benchmark` steps sequentially.
- Use one managed Docker setup and one guaranteed cleanup around the ladder.
- Stop on first failed step by default.
- Write `reports/system-mixed-workload-ladder.current.json`.
- Keep every per-step mixed workload report isolated by step name and index.
- Mask `ueacd` and database URLs in setup and cleanup evidence.

Out of scope:

- Adding the live ladder to `npm test` or `npm run quality`.
- Promoting any ladder result to a full-system ultra-concurrency claim.
- Replacing the Local Go, WSL Go, Docker Go, or direct16 conversation decisions.
- Adding training, OCR, RAG, vector, embedding, model, or external load-test
  dependencies.

## Contracts

- `npm run bench:system-mixed-workload:ladder` runs the default small ladder.
- `--steps` uses compact `name:identityConcurrency:identityOperations:conversationConcurrency:conversationOperations`
  entries separated by commas; Teaching Archive inherits identity load unless
  the step appends `:teachingConcurrency:teachingOperations`.
- The default ladder is intentionally tiny: `smoke` then `low`.
- The ladder writes one rollup report and one per-step mixed workload report.
- The rollup report uses `workloadType=MIXED_WORKLOAD_LADDER` and
  `benchmarkKind=system_mixed_workload_ladder`.
- Managed Docker runs `perf:identity-session:reset`, then `up`, and performs a
  final `reset` by default.
- Setup failure prevents step execution but still records cleanup.

## Acceptance Criteria

- Focused tests prove kebab-case parsing and compact step parsing.
- Focused tests prove per-step report paths and mixed workload options are
  isolated.
- Focused tests prove all-passed steps produce a passed ladder report.
- Focused tests prove default stop-on-failure behavior.
- Focused tests prove `--stop-on-failure false` continues later steps while the
  rollup remains failed.
- Focused tests prove managed Docker setup failure skips steps and masks
  secrets.
- `node --test tools/run-system-mixed-workload-ladder.test.mjs` passes.
- `npm run test:tools` and `npm run quality` pass.

## Rollback

Remove the ladder runner, focused tests, package script, generated ladder
reports, registry entry if added, and this SDD. The single-step mixed workload
runner from SDD 0137 remains usable.

## Observability And Performance Evidence

The ladder rollup records:

- configured, executed, passed, failed, and first-failed step counts;
- per-step identity, conversation, and Teaching Archive concurrency;
- per-step max P95/P99 and total errors;
- managed Docker setup and cleanup command results;
- highest passed step and first failed step;
- a next action that keeps ladder evidence separate from production capacity
  promotion.
