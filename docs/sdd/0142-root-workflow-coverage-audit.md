# SDD 0142: Root Workflow Coverage Audit

## Problem

The sustained mixed workload scale-up runner proves that the current five-slice
load profile can run repeatedly at a small stepped load. It still does not prove
that the evidence is mapped back to the immutable root requirements. Without
that mapping, a capacity claim could drift into module vanity numbers.

The refactor needs a root workflow coverage audit that reads the immutable root
requirements file, checks the current workflow evidence reports, and records
which root workflows are covered by contracts, policy checks, mixed workload
smoke, or worker boundary evidence.

## Source Requirement References

- Root requirement: teacher and student login, including WeChat and password
  login, must support teaching, research, student app, and remote/social entry.
- Root requirement: research mode includes conversation, model nodes, device
  collaboration, knowledge, workflow, plugin, and agent capabilities.
- Root requirement: teaching mode includes quizzes, AI grading, resource search,
  tutoring, archive material, student records, and personalized support.
- Root requirement: public/private knowledge isolation and retrieval efficiency
  are core product boundaries.
- Root requirement: workflow and plugin generation must be AI-generated,
  sandbox-tested, performance/effect-reviewed by a human, and saved only after
  approval.
- Baseline runtime must not add model, OCR, RAG, vector, embedding, training, or
  external benchmark dependencies.

## Scope

In scope:

- Add `tools/root-workflow-coverage-audit.mjs`.
- Read the immutable root requirements file without modifying it.
- Map root workflows to current evidence reports:
  - identity and remote entry;
  - research conversation and fusion;
  - teaching archive, quiz, and AI grading;
  - student app personalized learning;
  - knowledge access and retrieval;
  - AI worker optional model runtime;
  - Agent Harness local control;
  - generated workflow/plugin self-evolution.
- Reuse current source reports rather than introducing new runtime dependencies.
- Fail readiness when root anchors are missing, source reports are invalid,
  mixed workload slices disappear, forbidden AI dependencies enter baseline, or
  strict quality is failing.
- Add an npm script and wire the audit into the quality gate.

Out of scope:

- Promoting full-system ultra-concurrency.
- Running a new live high-concurrency benchmark.
- Implementing UI redesign, student mobile UI, or real model/OCR/training
  execution.
- Adding model, OCR, RAG, vector, embedding, training, or external benchmark
  dependencies to the baseline.

## Contracts

- `npm run audit:root-workflow-coverage` writes
  `reports/root-workflow-coverage.current.json`.
- The report uses `workloadType=ROOT_WORKFLOW_COVERAGE`.
- The default root requirements source is
  `../智能教研助手/项目根本需求（禁止改动）`.
- The audit treats workflow/plugin registry `decision=ALLOW_SAVE` as ready
  evidence for the generated workflow/plugin save path.
- Contract-only workflows remain explicitly labeled as contract-only, so the
  report cannot be mistaken for a production runtime SLO.

## Acceptance Criteria

- Focused tests prove all current root workflows pass with complete evidence.
- Focused tests fail when the immutable root requirement text is missing.
- Focused tests fail when a required source report is missing.
- Focused tests fail when the sustained scale-up report drops a root mixed
  workload slice.
- Focused tests fail when forbidden AI runtime dependencies re-enter baseline.
- Focused tests fail when strict quality evidence is not passing.
- Capacity audit tests prove root workflow coverage removes only that evidence
  gap while cross-module diagnostics and root SLO review remain required.
- `node --check tools/root-workflow-coverage-audit.mjs` passes.
- `node --test tools/root-workflow-coverage-audit.test.mjs` passes.
- `npm run test:tools` and `npm run quality` pass.

## Rollback

Remove the root workflow coverage audit, focused tests, package script, quality
gate command, generated report, registry entry, capacity audit changes, and this
SDD. Sustained mixed workload scale-up evidence remains usable but no longer
counts as root workflow coverage evidence.

## Observability And Performance Evidence

The report records:

- the immutable root requirements source path and matched anchor count;
- total, covered, mixed-covered, and contract-only workflow counts;
- per-workflow coverage class, matched anchors, report checks, and mixed
  workload checks;
- findings for source parseability, root anchor mapping, mixed workload slices,
  baseline dependency cleanliness, and strict quality;
- a next action that still blocks capacity promotion until cross-module
  database/queue diagnostics and root SLO review exist.
