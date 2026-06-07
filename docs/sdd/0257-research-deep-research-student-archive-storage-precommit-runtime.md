# SDD 0257 - Research Deep Research Student Archive Storage Precommit Runtime

## Problem

`ResearchAgent.deep_research` can now write append-only durable student archive
projection evidence. The next whole-system boundary is preparing that projection
for the Teaching Archive main storage path without falsely claiming that the
main database has already been written.

The existing Teaching Archive main table, `teaching_archive_items`, stores
archive metadata. It does not store every deep-research claim, citation,
sourceHash, limitation, risk, and projection review detail. Directly flattening
the projection into the table would lose evidence fidelity. This slice therefore
prepares a reviewed `createTeachingArchiveItem` command while preserving the
full projection evidence in the append-only projection log.

## Scope

Add a `deep_research` student archive storage precommit runtime.

The runtime command port is
`DeepResearchStudentArchiveStoragePrecommitPort.prepareTeachingArchiveCreateCommand`.

This slice:

- consumes only a
  `research_deep_research_student_archive_projection_runtime` output with
  `STUDENT_ARCHIVE_PROJECTION_WRITTEN`
- requires an `AGENT_INTERNAL` service principal with `RESEARCH_READ`,
  `STUDENT_ARCHIVE_WRITE`, and `STUDENT_ASSIGNED_READ`
- verifies the service principal can write the target student archive scope
- maps the projection into a Teaching Archive `createTeachingArchiveItem`
  command for `CreateArchiveItem.ExecuteWithPersistence`
- prepares a `STUDENT` owner archive metadata request using `SYSTEM_IMPORT`,
  a projection-backed `contentRef`, bounded tags, and safe analysis intents
- records the target use case, repository, table, and storage shape:
  `ArchiveRepository.Create` and `teaching_archive_items`
- preserves the source projection record, projection review, persistence
  command, student delivery envelope, claim count, citation count, source hash
  count, and evidence refs
- uses an append-only precommit log and idempotency key for safe replay
- blocks direct database access, HTTP execution, direct publication, external
  model calls, local tool mutation, remote device control, and Swarm
- sets `mainDatabaseWritePrepared=true`
- keeps `mainDatabaseWriteStarted=false` and `mainDatabaseWriteCommitted=false`

This is a main database storage precommit, not the final database commit. A
later storage commit slice must submit the prepared command to the Teaching
Archive Gateway and verify the persisted row.

## Contracts

- Input schema:
  `contracts/agent/deep-research-student-archive-storage-precommit.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-student-archive-storage-precommit.output.schema.json`
- Examples:
  `contracts/agent/deep-research-student-archive-storage-precommit.input.example.json`
  and
  `contracts/agent/deep-research-student-archive-storage-precommit.output.example.json`
- Runtime:
  `tools/research-deep-research-student-archive-storage-precommit-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-student-archive-storage-precommit-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-student-archive-storage-precommit-audit.mjs`
- Audit tests:
  `tools/research-deep-research-student-archive-storage-precommit-audit.test.mjs`
- Teaching Archive storage path:
  `contracts/openapi/teaching-archive.archive-items.path.yaml`,
  `contracts/sql/teaching-archive.sql`,
  `services/teaching-archive-gateway/internal/domain/archive.go`,
  `services/teaching-archive-gateway/internal/domain/principal.go`,
  `services/teaching-archive-gateway/internal/usecase/create_archive_item.go`,
  and
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only precommit log defaults to
`reports/research-command-log/deep-research-student-archive-storage-precommit.jsonl`.

## Acceptance Criteria

- `node --test tools/research-deep-research-student-archive-storage-precommit-runtime.test.mjs`
  passes.
- `node --test tools/research-deep-research-student-archive-storage-precommit-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-student-archive-storage-precommit`
  reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchStudentArchiveStoragePrecommit`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes
  `Research deep_research student archive storage precommit audit`.
- The architecture board states that `deep_research` has storage precommit at
  9.7/10 while main DB commit, true multi-model fusion, and public publication
  remain separate reviewed slices.

## Rollback

Remove the storage precommit schemas, examples, runtime, tests, audit, audit
tests, report, precommit log output, `package.json` audit script, strict
quality entry, root workflow coverage requirement, structure-verifier entries,
and architecture board text. Keep SDD 0242 through SDD 0256 intact because
intent admission, worker lifecycle, retrieval planning, retrieval execution,
reasoning synthesis, final-answer review, finalization, render preview,
publication precheck, teacher delivery, student visibility review, student
delivery, archive persistence command, projection review, and durable
projection remain valid without Teaching Archive main storage precommit.
