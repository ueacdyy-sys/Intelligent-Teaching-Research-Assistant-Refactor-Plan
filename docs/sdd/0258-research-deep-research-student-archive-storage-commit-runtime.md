# SDD 0258 - Research Deep Research Student Archive Storage Commit Runtime

## Problem

`ResearchAgent.deep_research` can now prepare a reviewed Teaching Archive
`createTeachingArchiveItem` command from durable student archive projection
evidence. The next whole-system boundary is committing that prepared command
through the Teaching Archive use case port without letting JavaScript bypass the
service boundary with raw SQL or HTTP.

This slice turns the storage precommit into a committed Teaching Archive item.
It proves the deep-research command shape is accepted by the existing Go
Teaching Archive use case and records committed evidence. Physical PostgreSQL
row verification remains a later integration slice unless explicitly promoted.

## Scope

Add a `deep_research` student archive storage commit runtime.

The runtime command port is
`DeepResearchStudentArchiveStorageCommitPort.commitTeachingArchiveCreateCommand`.

This slice:

- consumes only a
  `research_deep_research_student_archive_storage_precommit_runtime` output with
  `TEACHING_ARCHIVE_MAIN_DB_STORAGE_PRECOMMIT_PREPARED`
- requires a storage commit policy that allows main database writes only through
  an injected Teaching Archive use case port
- requires `TeachingArchiveCreateItemPort.createArchiveItem`
- invokes the injected port with the prepared `createTeachingArchiveItem`
  command and idempotency context
- requires the port result to be `persisted`
- requires the committed archive item id to use the `tarch_` prefix
- preserves source projection, precommit record, evidence refs, idempotency key,
  target use case, target repository, and target table
- validates student scope, service principal scopes, safe text, allowed
  material type, allowed analysis intents, and no AI grading intent
- records append-only commit evidence for safe replay
- blocks direct database access, HTTP execution, direct publication, external
  model calls, local tool mutation, remote device control, and Swarm
- sets `mainDatabaseWritePrepared=true`
- sets `mainDatabaseWriteStarted=true`
- sets `mainDatabaseWriteCommitted=true`

This is a committed Teaching Archive use case boundary, not a JS direct database write. The Go bridge test verifies that `CreateArchiveItem.ExecuteWithPersistence`
accepts the deep-research storage command shape.

## Contracts

- Input schema:
  `contracts/agent/deep-research-student-archive-storage-commit.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-student-archive-storage-commit.output.schema.json`
- Examples:
  `contracts/agent/deep-research-student-archive-storage-commit.input.example.json`
  and
  `contracts/agent/deep-research-student-archive-storage-commit.output.example.json`
- Runtime:
  `tools/research-deep-research-student-archive-storage-commit-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-student-archive-storage-commit-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-student-archive-storage-commit-audit.mjs`
- Audit tests:
  `tools/research-deep-research-student-archive-storage-commit-audit.test.mjs`
- Teaching Archive Go bridge:
  `services/teaching-archive-gateway/internal/usecase/create_archive_item_test.go`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only commit log defaults to
`reports/research-command-log/deep-research-student-archive-storage-commit.jsonl`.

## Acceptance Criteria

- `node --test tools/research-deep-research-student-archive-storage-commit-runtime.test.mjs`
  passes.
- `go test ./services/teaching-archive-gateway/internal/usecase -run TestCreateArchiveItemAcceptsDeepResearchStorageCommitCommandShape -count=1`
  passes.
- `node --test tools/research-deep-research-student-archive-storage-commit-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-student-archive-storage-commit`
  reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchStudentArchiveStorageCommit`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes
  `Research deep_research student archive storage commit audit`.
- The architecture board states that `deep_research` has storage commit at
  9.8/10 through an injected Teaching Archive use case port while physical
  PostgreSQL row verification, true multi-model fusion, and public publication
  remain separate reviewed slices.

## Rollback

Remove the storage commit schemas, examples, runtime, tests, audit, audit tests,
report, commit log output, Go bridge test additions, `package.json` audit
script, strict quality entry, root workflow coverage requirement,
structure-verifier entries, and architecture board text. Keep SDD 0242 through
SDD 0257 intact because intent admission, worker lifecycle, retrieval planning,
retrieval execution, reasoning synthesis, final-answer review, finalization,
render preview, publication precheck, teacher delivery, student visibility
review, student delivery, archive persistence command, projection review,
durable projection, and storage precommit remain valid without the committed
Teaching Archive use case boundary.
