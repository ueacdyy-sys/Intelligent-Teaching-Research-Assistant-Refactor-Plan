# SDD 0259 - Research Deep Research Student Archive Row Verification Runtime

## Problem

`ResearchAgent.deep_research` can now commit a reviewed Teaching Archive
`createArchiveItem` command through the injected use case port. That proves the
write boundary was invoked and returned `persisted`, but it still leaves one
evidence gap: the committed item has not been verified as a physical
`teaching_archive_items` row shape.

This slice closes that gap without changing the fast path or repeating
production10k benchmarks. It verifies the committed archive item through an
injected row-read port and Go repository evidence. It is not a JS direct database read.

## Scope

Add a `deep_research` student archive physical row verification runtime.

The runtime command port is
`DeepResearchStudentArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow`.

This slice:

- consumes only a
  `research_deep_research_student_archive_storage_commit_runtime` output with
  `TEACHING_ARCHIVE_MAIN_DB_STORAGE_COMMITTED`
- requires `TeachingArchiveRowReadPort.getArchiveItemById`
- requires the read port result to identify
  `ArchiveRepository.GetByID` and `teaching_archive_items`
- verifies the physical row fields match the committed archive item exactly:
  id, owner type, student id, material type, title, source, content ref, tags,
  analysis intents, OCR status, and created at
- records append-only row verification evidence for idempotent replay
- preserves storage commit evidence and projection evidence references
- blocks direct database access, HTTP execution, external model calls, local
  tool mutation, remote device control, and Swarm
- keeps `mainDatabaseWritePrepared=true`
- keeps `mainDatabaseWriteStarted=true`
- keeps `mainDatabaseWriteCommitted=true`
- sets `physicalDatabaseRowVerified=true`

The Go repository evidence is the real adapter-side proof:
`ArchiveRepository.GetByID` selects from `teaching_archive_items` by `id = $1`
and scans the row through `scanArchiveItem`.

## Contracts

- Input schema:
  `contracts/agent/deep-research-student-archive-row-verification.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-student-archive-row-verification.output.schema.json`
- Examples:
  `contracts/agent/deep-research-student-archive-row-verification.input.example.json`
  and
  `contracts/agent/deep-research-student-archive-row-verification.output.example.json`
- Runtime:
  `tools/research-deep-research-student-archive-row-verification-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-student-archive-row-verification-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-student-archive-row-verification-audit.mjs`
- Audit tests:
  `tools/research-deep-research-student-archive-row-verification-audit.test.mjs`
- Teaching Archive Go repository evidence:
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go`
  and
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items_get_by_id_test.go`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only verification log defaults to
`reports/research-command-log/deep-research-student-archive-row-verification.jsonl`.

## Acceptance Criteria

- `node --test tools/research-deep-research-student-archive-row-verification-runtime.test.mjs`
  passes.
- `go test ./services/teaching-archive-gateway/internal/adapter/postgres -run TestGetByIDReturnsDeepResearchStorageCommitPhysicalRow -count=1`
  passes.
- `node --test tools/research-deep-research-student-archive-row-verification-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-student-archive-row-verification`
  reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchStudentArchiveRowVerification`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes
  `Research deep_research student archive row verification audit`.
- The architecture board states that `deep_research` has physical row
  verification at 9.9/10 while true multi-model fusion, complete AI Tutor, and
  public publication remain later reviewed slices.

## Rollback

Remove the row verification schemas, examples, runtime, tests, audit, audit
tests, report, verification log output, Go `GetByID` evidence test,
`package.json` audit script, strict quality entry, root workflow coverage
requirement, structure-verifier entries, and architecture board text. Keep SDD
0242 through SDD 0258 intact because intent admission, worker lifecycle,
retrieval planning, retrieval execution, reasoning synthesis, final-answer
review, finalization, render preview, publication precheck, teacher delivery,
student visibility review, student delivery, archive persistence command,
projection review, durable projection, storage precommit, and storage commit
remain valid without the physical row verification slice.
