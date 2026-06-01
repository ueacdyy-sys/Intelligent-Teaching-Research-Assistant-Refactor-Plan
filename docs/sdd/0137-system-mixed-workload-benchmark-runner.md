# SDD 0137: System Mixed Workload Benchmark Runner

## Problem

SDD 0136 deliberately blocks any full-system ultra-concurrency claim because
the current evidence is still module-scoped. The refactor needs a repeatable
runner that can exercise multiple root slices at the same time, without adding
training, OCR, RAG, vector, embedding, model, or external benchmark
dependencies to the baseline.

The first slice is a smoke-grade orchestrator. It proves the harness shape and
report contract before any claim is promoted.

## Source Requirement References

- Root requirement: refactor the whole Intelligent Teaching Research Assistant,
  with modules used only as delivery order.
- Root requirement: teaching, research, knowledge, workflow, plugin, and worker
  evidence must serve the whole system rather than isolated benchmark vanity
  numbers.
- Root requirement: baseline install must stay small; model training and heavy
  AI runtime dependencies remain outside the default runtime.
- SDD 0136: no full-system ultra-concurrency claim is supported until mixed
  workload evidence exists and is reviewed against root workflows.

## Scope

In scope:

- Add `tools/run-system-mixed-workload-benchmark.mjs`.
- Run Identity HTTP, Research conversation write, Teaching Archive,
  Knowledge retrieval policy, and AI worker admission checks concurrently.
- Write `reports/system-mixed-workload-benchmark.current.json`.
- Record `workloadType=MIXED_WORKLOAD` and `benchmarkKind=system_mixed_workload`
  so later audits can distinguish this from module-only evidence.
- Mask `ueacd` and database URLs in report command/output evidence.
- Validate gateway port ranges before starting child workloads.
- Optionally manage the Docker identity-session profile, while always recording
  setup and cleanup status.
- Register the current smoke report as mixed workload evidence after a truthful
  local run exists.

Out of scope:

- Promoting this smoke run as a full-system production capacity claim.
- Adding the live benchmark to `npm test` or `npm run quality`; those gates must
  remain Docker-free.
- Replacing Local Go or WSL Go runtime decisions from SDD 0135.
- Introducing model, OCR, RAG, vector, embedding, training, or third-party
  benchmark dependencies.

## Contracts

- `npm run bench:system-mixed-workload` runs the orchestrator with smoke
  defaults.
- The runner defaults to Docker-free orchestration. Docker management is
  explicit via `--manage-docker true`.
- `--manage-docker true` runs `npm run perf:identity-session:up` before
  workloads and runs `perf:identity-session:down` by default afterward.
- Setup failure prevents child workloads from running and emits a failed report.
- Child workload failures produce a failed mixed-workload report rather than a
  promoted system claim.
- Reports include child status, p95/p99/rps when available, total workload
  errors, orchestration errors, source commands, setup, cleanup, and next action.
- A registered smoke report changes the system-capacity claim from no mixed
  evidence to review-required mixed evidence. It still must not promote a
  full-system ultra-concurrency claim.

## Acceptance Criteria

- Focused tests prove kebab-case CLI parsing.
- Focused tests prove the five root-module child commands are generated with
  configured ports and output reports.
- Focused tests prove PASSED/READY child reports summarize to PASSED.
- Focused tests prove secrets and database URLs are masked in report evidence.
- Focused tests prove failed child commands make the mixed workload fail.
- Focused tests prove overlapping gateway port ranges are rejected.
- Focused tests prove managed Docker setup failure skips workloads while still
  recording cleanup.
- `node --test tools/run-system-mixed-workload-benchmark.test.mjs` passes.
- `npm run test:tools` and `npm run quality` pass.

## Rollback

Remove the runner, focused tests, package script, and this SDD. No service,
schema, Docker, or root requirement files need to change.

## Observability And Performance Evidence

The runner report records:

- profile, concurrency, gateway fanout, database pool, and batch settings;
- child workload report presence and parseability;
- p95, p99, rps, readiness, and error summaries per workload;
- setup and cleanup command results when Docker management is enabled;
- masked source commands and output tails;
- an explicit next action that keeps smoke evidence separate from a
  full-system ultra-concurrency claim.
