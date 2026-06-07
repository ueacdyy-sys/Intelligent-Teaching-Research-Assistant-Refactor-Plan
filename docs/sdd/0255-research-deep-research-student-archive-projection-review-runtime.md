# SDD 0255 - Research Deep Research Student Archive Projection Review Runtime

## Problem

`ResearchAgent.deep_research` can now record an append-only student archive
persistence command. The next boundary is authorization for a later durable
student archive projection runtime.

This slice must not perform durable projection. It records a human-reviewed
authorization ticket so that a later runtime can safely decide whether to write
student archive rows. Writing the main database, writing final student archive
rows, publishing globally, calling external models, controlling local tools, or
starting Swarm remains outside this step.

## Scope

Add a `deep_research` student archive projection review runtime.

This slice:

- consumes only a
  `research_deep_research_student_archive_persistence_runtime` output with
  `STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED`
- requires the controlled projection review service principal with
  `RESEARCH_READ`, `STUDENT_ARCHIVE_PERSISTENCE`, and
  `STUDENT_ARCHIVE_PROJECTION_REVIEW`
- records through
  `DeepResearchStudentArchiveProjectionReviewPort.recordStudentArchiveProjectionReview`
- creates a `DURABLE_STUDENT_ARCHIVE_PROJECTION_REVIEW`
- marks the review as
  `STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN`
- preserves claims, citations, source hashes, limitations, risk, scope,
  source persistence command, teacher package, student visibility review, and
  evidence refs
- uses an append-only review log and idempotency key for safe replay
- blocks direct publication, direct database access, main database writes,
  student archive projection writes, external model calls, local tool mutation,
  remote device control, and Swarm
- sets `studentArchiveProjectionWritten=false`,
  `studentArchivePersisted=false`, and
  `requiresFutureDurableProjectionRuntime=true`

This is not final durable student archive projection. It is the reviewed
authorization record that a later durable projection runtime may consume.

## Contracts

- Input schema:
  `contracts/agent/deep-research-student-archive-projection-review.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-student-archive-projection-review.output.schema.json`
- Examples:
  `contracts/agent/deep-research-student-archive-projection-review.input.example.json`
  and
  `contracts/agent/deep-research-student-archive-projection-review.output.example.json`
- Runtime:
  `tools/research-deep-research-student-archive-projection-review-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-student-archive-projection-review-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-student-archive-projection-review-audit.mjs`
- Audit tests:
  `tools/research-deep-research-student-archive-projection-review-audit.test.mjs`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only review log defaults to
`reports/research-command-log/deep-research-student-archive-projection-review.jsonl`.

## Acceptance Criteria

- `node --test tools/research-deep-research-student-archive-projection-review-runtime.test.mjs`
  passes.
- `node --test tools/research-deep-research-student-archive-projection-review-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-student-archive-projection-review`
  reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchStudentArchiveProjectionReview`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes
  `Research deep_research student archive projection review audit`.
- The architecture board states that `deep_research` has a student archive
  projection review runtime at 9.5/10 while final durable student archive
  projection, main database writes, true multi-model fusion, and final archive
  publishing remain future reviewed slices.

## Rollback

Remove the student archive projection review schemas, examples, runtime, tests,
audit, audit tests, report, review log output, `package.json` audit script,
strict quality entry, root workflow coverage requirement, structure-verifier
entries, and architecture board text. Keep SDD 0242 through SDD 0254 intact
because intent admission, worker lifecycle, retrieval planning, retrieval
execution, reasoning synthesis, final-answer review, finalization, render
preview, publication precheck, teacher delivery, student visibility review,
student delivery, and archive persistence command recording remain valid without
projection review.
