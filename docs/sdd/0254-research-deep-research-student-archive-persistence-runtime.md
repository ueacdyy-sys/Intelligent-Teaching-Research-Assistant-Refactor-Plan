# SDD 0254 - Research Deep Research Student Archive Persistence Command Runtime

## Problem

`ResearchAgent.deep_research` now creates a student app renderable delivery
envelope after student visibility review. The next root requirement boundary is
student archive handling: the system must be able to create audited evidence
that the envelope is ready to enter the student learning archive pipeline.

This step must not be confused with durable projection. Recording a persistence
command is a controlled queue boundary. Writing the main database, writing final
student archive rows, publishing globally, calling external models, controlling
local tools, or starting Swarm would cross a different risk boundary.

## Scope

Add a `deep_research` student archive persistence command runtime.

This slice:

- consumes only a `research_deep_research_student_delivery_runtime` output with
  `STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED`
- requires the controlled persistence service principal with `RESEARCH_READ`,
  `STUDENT_ARCHIVE_PERSISTENCE`, and `STUDENT_APP_DELIVERY`
- records through
  `DeepResearchStudentArchivePersistencePort.recordStudentArchivePersistenceCommand`
- creates an
  `EVIDENCE_GROUNDED_STUDENT_ARCHIVE_PERSISTENCE_COMMAND`
- marks the command as
  `STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED`
- preserves claims, citations, source hashes, limitations, risk, scope,
  student visibility review ID, teacher package ID, and evidence refs
- uses an append-only command log and idempotency key for safe replay
- blocks direct publication, direct database access, main database writes,
  student archive projection writes, external model calls, local tool mutation,
  remote device control, and Swarm
- sets `studentArchiveProjectionWritten=false` and
  `requiresFutureDurableProjectionReview=true`

This is not durable student archive projection. It is the reviewed append-only
student archive persistence command that a later projection runtime may consume.

## Contracts

- Input schema:
  `contracts/agent/deep-research-student-archive-persistence.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-student-archive-persistence.output.schema.json`
- Examples:
  `contracts/agent/deep-research-student-archive-persistence.input.example.json`
  and
  `contracts/agent/deep-research-student-archive-persistence.output.example.json`
- Runtime:
  `tools/research-deep-research-student-archive-persistence-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-student-archive-persistence-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-student-archive-persistence-audit.mjs`
- Audit tests:
  `tools/research-deep-research-student-archive-persistence-audit.test.mjs`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only command log defaults to
`reports/research-command-log/deep-research-student-archive-persistence.jsonl`.

## Acceptance Criteria

- `node --test tools/research-deep-research-student-archive-persistence-runtime.test.mjs`
  passes.
- `node --test tools/research-deep-research-student-archive-persistence-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-student-archive-persistence` reports
  `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchStudentArchivePersistence`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes
  `Research deep_research student archive persistence audit`.
- The architecture board states that `deep_research` has a student archive
  persistence command runtime at 9.4/10 while durable student archive
  projection, main database writes, true multi-model fusion, and final archive
  publishing remain future reviewed slices.

## Rollback

Remove the student archive persistence schemas, examples, runtime, tests,
audit, audit tests, report, command log output, `package.json` audit script,
strict quality entry, root workflow coverage requirement, structure-verifier
entries, and architecture board text. Keep SDD 0242 through SDD 0253 intact
because intent admission, worker lifecycle, retrieval planning, retrieval
execution, reasoning synthesis, final-answer review, finalization, render
preview, publication precheck, teacher delivery, student visibility review, and
student delivery remain valid without archive persistence command recording.
