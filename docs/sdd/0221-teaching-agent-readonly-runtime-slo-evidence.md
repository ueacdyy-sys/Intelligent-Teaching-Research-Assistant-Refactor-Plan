# SDD 0221: TeachingAgent Read-Only Runtime SLO Evidence

## Problem

SDD 0219 and SDD 0220 made `TeachingAgent.search_teaching_material`
contractually safe, but a contract-only adapter is still not enough for root
workflow coverage. The user has also asked not to keep repeating broad
performance tests after the production10k result is already good enough for the
current refactor stage.

The next slice therefore needs a small, cheap runtime SLO audit that reuses
existing Teaching Archive read-path evidence. This proves the TeachingAgent
read-only path can be promoted from "contract only" to "contract plus small
runtime evidence" without claiming the whole Agent product is complete.

## Scope

In scope:

- Add a TeachingAgent read-only runtime SLO audit.
- Reuse `reports/teaching-archive-benchmark.current.json` and its
  `listArchiveItems` phase as the current read-port runtime evidence.
- Require the Agent Skill contract audit to be `READY`.
- Require the TeachingAgent read-only adapter contract to be `READY`.
- Require `listArchiveItems.operations > 0`, `errors = 0`, and `p99 <= 50ms`.
- Add the audit to strict quality and root workflow coverage.
- Keep the evidence class narrow: this is only TeachingAgent read-only SLO
  evidence, not a broad production10k rerun and not full Agent Runtime evidence.

Out of scope:

- Re-running production10k mixed workload benchmarks.
- Implementing the Agent loop, memory, Swarm, or model calls.
- Adding OCR, RAG, vector database, external model, or training dependencies to
  the baseline runtime.
- Allowing TeachingAgent writes, student archive reads, or direct database
  access.

## Contracts

- `tools/teaching-agent-readonly-runtime-slo-audit.mjs` generates
  `reports/teaching-agent-readonly-runtime-slo.current.json`.
- `tools/teaching-agent-readonly-runtime-slo-audit.test.mjs` checks the happy
  path and failure modes.
- `package.json` exposes `npm run audit:teaching-agent-readonly-runtime-slo`.
- `tools/quality-gate.mjs` runs this audit before root workflow coverage.
- `tools/root-workflow-coverage-audit.mjs` attaches this evidence to
  `teaching_archive_quiz_and_ai_grading`.
- `tools/verify-structure.mjs` requires the audit and its test file.

The current evidence source is:

- Source report: `reports/teaching-archive-benchmark.current.json`;
- Source phase: `listArchiveItems`;
- Operations: `4`;
- Errors: `0`;
- P95/P99: `11ms / 11ms`;
- Evidence boundary: read-only, no direct database adapter, no writes, no
  student data, no external model.

## Acceptance Criteria

- `npm run audit:teaching-agent-readonly-runtime-slo` reports `READY`.
- The audit fails if Agent Skill or TeachingAgent adapter contracts are not
  ready.
- The audit fails if `listArchiveItems` has no operations, has errors, or
  exceeds the 50ms P99 target.
- Root workflow coverage counts two runtime-backed workflows:
  TeachingAgent read-only and workflow/plugin runtime SLO.
- Strict quality gate includes the TeachingAgent read-only runtime SLO audit.
- Architecture board states that performance work is currently collected and
  that future performance checks should follow new feature slices.

## Rollback

Remove `tools/teaching-agent-readonly-runtime-slo-audit.mjs`,
`tools/teaching-agent-readonly-runtime-slo-audit.test.mjs`, the package script,
the quality-gate command entry, the root workflow runtime evidence entry, the
structure requirement, and `reports/teaching-agent-readonly-runtime-slo.current.json`.
Then regenerate `reports/root-workflow-coverage.current.json` and update the
architecture board back to "contract-only" status for TeachingAgent.

## Observability And Performance Evidence

This slice intentionally avoids another broad performance run. The current
system-level production10k evidence remains:

- `22,435.1` read/write RPS;
- P99 `44.44ms`;
- `0` errors.

The new evidence is smaller and narrower: TeachingAgent read-only material
search can reuse the Teaching Archive read-port evidence at P99 `11ms` with
zero errors. That is enough to keep the refactor moving into the next module,
but it is not enough to claim full Agent Runtime, full AI/RAG/OCR load, 10ms
production P99, or long-soak ultra-high-concurrency readiness.
