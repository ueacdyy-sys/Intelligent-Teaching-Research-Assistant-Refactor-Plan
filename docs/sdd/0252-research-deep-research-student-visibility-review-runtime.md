# SDD 0252 - Research Deep Research Student Visibility Review Runtime

## Problem

`ResearchAgent.deep_research` now creates a teacher research workspace delivery
package. The next boundary is not to publish it directly to students, but to
record a human review that decides whether the package may enter a future
student-facing delivery runtime.

Without this boundary, the system could accidentally treat a teacher-only
package as student-visible content. That would violate the root requirement
that the student app only accesses teacher-approved teaching resources and
learning support materials.

## Scope

Add a `deep_research` student visibility review runtime.

This slice:

- consumes only a
  `research_deep_research_teacher_delivery_runtime` output with
  `TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE`
- requires a human teacher or admin with `STUDENT_VISIBILITY_REVIEW`
- records through
  `DeepResearchStudentVisibilityReviewPort.recordStudentVisibilityReview`
- records `APPROVED_FOR_STUDENT_VISIBILITY_DELIVERY_RUNTIME`
- preserves claims, citations, source hashes, limitations, risk, target
  audience scope, teacher delivery record ID, package ID, and evidence refs
- uses an append-only command log and idempotency key for safe replay
- blocks direct student visibility, direct publication, direct database access,
  main database writes, student archive writes, external model calls, local
  tool mutation, remote device control, and Swarm
- sets `requiresFutureStudentDeliveryRuntime=true` and
  `requiresFuturePersistenceReview=true`

This is not student delivery. It is the reviewed ticket that a later delivery
runtime may consume.

## Contracts

- Input schema:
  `contracts/agent/deep-research-student-visibility-review.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-student-visibility-review.output.schema.json`
- Examples:
  `contracts/agent/deep-research-student-visibility-review.input.example.json`
  and
  `contracts/agent/deep-research-student-visibility-review.output.example.json`
- Runtime:
  `tools/research-deep-research-student-visibility-review-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-student-visibility-review-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-student-visibility-review-audit.mjs`
- Audit tests:
  `tools/research-deep-research-student-visibility-review-audit.test.mjs`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only command log defaults to
`reports/research-command-log/deep-research-student-visibility-review.jsonl`.

## Acceptance Criteria

- `node --test tools/research-deep-research-student-visibility-review-runtime.test.mjs`
  passes.
- `node --test tools/research-deep-research-student-visibility-review-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-student-visibility-review` reports
  `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchStudentVisibilityReview`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes
  `Research deep_research student visibility review audit`.
- The architecture board states that `deep_research` has a student visibility
  review runtime while actual student delivery, durable persistence, true
  multi-model fusion, and student archive writes remain future reviewed
  slices.

## Rollback

Remove the student visibility review schemas, examples, runtime, tests, audit,
audit tests, report, command log output, `package.json` audit script, strict
quality entry, root workflow coverage requirement, structure-verifier entries,
and architecture board text. Keep SDD 0242 through SDD 0251 intact because
intent admission, worker lifecycle, retrieval planning, retrieval execution,
reasoning synthesis, final-answer review, finalization, render preview,
publication precheck, and teacher delivery remain valid without student
visibility review.
