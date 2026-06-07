# SDD 0256 - Research Deep Research Student Archive Projection Runtime

## Problem

`ResearchAgent.deep_research` now has a reviewed projection authorization
ticket. The next root requirement boundary is durable student archive projection:
the approved student-facing evidence should become a durable student archive
entry without bypassing safety or writing the main database.

This step is the first slice that sets `studentArchiveProjectionWritten=true`.
It must stay narrower than general database integration. The runtime writes an
append-only projection record through a dedicated port and keeps main database
writes, global publication, external model calls, local tool mutation, and Swarm
outside the boundary.

## Scope

Add a `deep_research` student archive projection runtime.

This slice:

- consumes only a
  `research_deep_research_student_archive_projection_review_runtime` output with
  `STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN`
- requires the controlled projection service principal with `RESEARCH_READ`,
  `STUDENT_ARCHIVE_PERSISTENCE`, and `STUDENT_ARCHIVE_PROJECTION_WRITE`
- records through
  `DeepResearchStudentArchiveProjectionPort.projectReviewedStudentArchiveEntry`
- creates a `DURABLE_STUDENT_ARCHIVE_PROJECTION_RECORD`
- marks the record as `STUDENT_ARCHIVE_PROJECTION_WRITTEN`
- preserves claims, citations, source hashes, limitations, risk, scope,
  source projection review, source persistence command, teacher package, student
  visibility review, and evidence refs
- uses an append-only projection log and idempotency key for safe replay
- blocks direct publication, direct database access, main database writes,
  external model calls, local tool mutation, remote device control, and Swarm
- sets `studentArchiveProjectionWritten=true`, `studentArchivePersisted=true`,
  and `studentArchiveWriteStarted=true`

This is durable student archive projection evidence, not general-purpose main database integration.
A later storage slice may map the append-only projection record into physical
database tables after separate review.

## Contracts

- Input schema:
  `contracts/agent/deep-research-student-archive-projection.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-student-archive-projection.output.schema.json`
- Examples:
  `contracts/agent/deep-research-student-archive-projection.input.example.json`
  and
  `contracts/agent/deep-research-student-archive-projection.output.example.json`
- Runtime:
  `tools/research-deep-research-student-archive-projection-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-student-archive-projection-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-student-archive-projection-audit.mjs`
- Audit tests:
  `tools/research-deep-research-student-archive-projection-audit.test.mjs`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only projection log defaults to
`reports/research-command-log/deep-research-student-archive-projection.jsonl`.

## Acceptance Criteria

- `node --test tools/research-deep-research-student-archive-projection-runtime.test.mjs`
  passes.
- `node --test tools/research-deep-research-student-archive-projection-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-student-archive-projection` reports
  `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchStudentArchiveProjection`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes
  `Research deep_research student archive projection audit`.
- The architecture board states that `deep_research` has durable student archive
  projection at 9.6/10 while main database integration, true multi-model fusion,
  and public publication remain separate reviewed slices.

## Rollback

Remove the student archive projection schemas, examples, runtime, tests, audit,
audit tests, report, projection log output, `package.json` audit script, strict
quality entry, root workflow coverage requirement, structure-verifier entries,
and architecture board text. Keep SDD 0242 through SDD 0255 intact because
intent admission, worker lifecycle, retrieval planning, retrieval execution,
reasoning synthesis, final-answer review, finalization, render preview,
publication precheck, teacher delivery, student visibility review, student
delivery, archive persistence command, and projection review remain valid
without durable projection.
