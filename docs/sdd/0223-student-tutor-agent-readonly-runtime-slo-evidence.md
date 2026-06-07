# SDD 0223: StudentTutorAgent Read-Only Runtime SLO Evidence

## Problem

The root requirements include the Student App, AI tutor, student archive,
teaching materials, scan-to-answer, and personalized practice. After
TeachingAgent and ResearchAgent gained read-only fast-path evidence, the next
whole-system slice should move the student tutoring workflow forward instead
of repeating broad performance tests.

StudentTutorAgent must be stricter than a generic chat agent. It can recommend
practice from the current student's own or assigned learning context, but it
must not expose other students, return raw student archive records, write
profile data, call external models, or turn advice into a final evaluation.

## Scope

In scope:

- Add `recommend_practice` input and output contracts.
- Add a StudentTutorAgent read-only adapter bound to
  `StudentLearningReadPort.recommendPracticeContext`.
- Require own-or-assigned student scope, no cross-student comparison, no raw
  student archive return, no final evaluation, no writes, no external model,
  and no local tool mutation.
- Reuse Student App flow evidence and Teaching Archive read-path evidence as a
  narrow runtime SLO proxy.
- Attach StudentTutorAgent read-only runtime SLO to root workflow coverage.

Out of scope:

- Full AI tutor reasoning, long memory, RAG synthesis, model calls, OCR, scan
  grading, or profile writes.
- Any direct update to final grades, student profile conclusions, or teacher
  evaluation records.
- Re-running production10k mixed workload benchmarks for this slice.
- Adding heavy model or training dependencies to the baseline runtime.

## Contracts

- `contracts/agent/skills/recommend-practice.input.schema.json` defines the
  scoped read-only recommendation input.
- `contracts/agent/skills/recommend-practice.output.schema.json` defines
  evidence-backed practice recommendations.
- `contracts/agent/student-tutor-agent-readonly-adapter.schema.json` binds the
  adapter to `StudentLearningReadPort.recommendPracticeContext`.
- `tools/student-tutor-agent-readonly-contract-audit.mjs` generates
  `reports/student-tutor-agent-readonly-contract.current.json`.
- `tools/student-tutor-agent-readonly-runtime-slo-audit.mjs` generates
  `reports/student-tutor-agent-readonly-runtime-slo.current.json`.
- `tools/quality-gate.mjs` runs both StudentTutorAgent audits before root
  workflow coverage.
- `tools/root-workflow-coverage-audit.mjs` attaches this evidence to
  `student_app_personalized_learning`.

Current evidence:

- Contract report: `reports/student-tutor-agent-readonly-contract.current.json`;
- Runtime report: `reports/student-tutor-agent-readonly-runtime-slo.current.json`;
- Source reports: `reports/student-app-flow.current.json` and
  `reports/teaching-archive-benchmark.current.json`;
- Source phase: `studentAppScopedTeachingArchiveRead`;
- Operations: `4`;
- P95/P99: `11ms / 11ms`;
- Errors: `0`;
- Boundary: no direct DB, no write, no cross-student data, no raw archive
  return, no final evaluation, no external model.

## Acceptance Criteria

- `npm run audit:student-tutor-agent-readonly-contract` reports `READY`.
- `npm run audit:student-tutor-agent-readonly-runtime-slo` reports `READY`.
- The runtime audit fails if the StudentTutorAgent contract report is not
  ready.
- The runtime audit fails if Student App flow evidence is not ready.
- The runtime audit fails if the scoped read phase has errors or exceeds the
  50ms P99 target.
- Root workflow coverage counts StudentTutorAgent as a runtime-backed workflow.
- Architecture board clearly states that this is a read-only recommendation
  fast path, not the full AI tutor product.

## Rollback

Remove the `recommend_practice` schemas and examples, StudentTutorAgent adapter
contract, package scripts, audit tools, quality-gate entries, root workflow
evidence entries, structure requirements, and generated StudentTutorAgent
reports. Then regenerate root workflow coverage and update the architecture
board back to StudentTutorAgent contract-only status.

## Observability And Performance Evidence

This slice intentionally avoids another broad production10k run. The current
system-level performance evidence remains:

- `22,435.1` read/write RPS;
- P99 `44.44ms`;
- `0` errors.

The new StudentTutorAgent evidence is smaller and scoped: recommendation
planning uses existing Student App and Teaching Archive read evidence at P99
`11ms` with zero errors. It supports continuing the refactor into real Agent
Runtime wiring and controlled write paths, but it still does not prove full AI
tutoring, model reasoning, OCR/scanning, 10ms production P99, or long-soak
ultra-high-concurrency readiness.
