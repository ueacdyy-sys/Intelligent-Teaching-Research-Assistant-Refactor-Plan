# SDD 0304: Teaching Archive Material Draft Storage Commit

## Problem

The immutable root requirements need teaching materials and student archive files to become real, durable workflow data. SDD 0303 prepares a reviewed `CreateArchiveItem.ExecuteWithPersistence` command, but it intentionally does not create the final archive item. The next boundary must commit that prepared command without letting JavaScript bypass the Teaching Archive service boundary with raw SQL, HTTP, OCR/RAG, AI-grading, or Swarm side effects.

## Scope

Add `TeachingArchiveMaterialDraftStorageCommitPort.commitArchiveMaterialDraftStorageCommand` as the next Teaching Archive controlled-write slice.

The runtime consumes the READY `TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT` report, verifies that the precommit still has `mainDatabaseWritePrepared=true`, `mainDatabaseWriteStarted=false`, and `mainDatabaseWriteCommitted=false`, then invokes an injected `TeachingArchiveCreateItemPort.createArchiveItem` adapter with the prepared `createTeachingArchiveItem` command and idempotency context.

This slice allows a main database write only through the injected Teaching Archive use case port. It is not a JS direct database write. It does not execute HTTP, does not start OCR/RAG, does not write AI grading state, does not mutate local tools, does not remote-control devices, and does not enable Swarm.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT` with `TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY`.
- Source precommit boundary must keep `mainDatabaseWriteStarted=false`, `mainDatabaseWriteCommitted=false`, `ocrOrRagJobWriteStarted=false`, and `aiGradingWriteStarted=false`.
- Commit policy must require `storagePrecommitRequired=true`, `teachingArchiveUseCaseCommitAllowed=true`, `injectedTeachingArchivePortRequired=true`, `idempotentStorageCommitRequired=true`, `mainDatabaseWriteAllowed=true`, and `preservePrecommitEvidenceRequired=true`.
- Commit policy must keep direct database access, HTTP execution, OCR/RAG job writes, AI grading writes, external model calls, remote device control, local tool mutation, and Swarm disabled.
- The injected port result must return a `persisted` archive item with a `tarch_` id and a request-body-matching owner, student, material type, title, source, and content ref.
- Runtime boundary sets `mainDatabaseWritePrepared=true`, `mainDatabaseWriteStarted=true`, `mainDatabaseWriteCommitted=true`, and `finalArchiveItemCreated=true` only because the injected use case port was invoked.
- Runtime boundary keeps `directDatabaseAccessAllowed=false`, `executeHttpRequestAllowed=false`, `ocrOrRagJobWriteStarted=false`, `aiGradingWriteStarted=false`, and `swarmAllowed=false`.
- Physical row verification remains a later slice.

## Acceptance Criteria

- Runtime tests cover successful use-case-port commit, idempotent replay, idempotency conflict, unsafe source state, forbidden commit policy, AI-grading analysis intent, missing port, leaked fields, unsafe port result, archive item id mismatch, student mismatch, and non-persisted output.
- Audit verifies source precommit readiness, runtime identity, safety boundaries, one-port probe, tests, existing Teaching Archive storage path, quality gate, root workflow coverage, structure verifier, SDD, and architecture board hooks.
- Root workflow coverage includes this slice in the Teaching Archive workflow and controlled Agent write workflow.
- Quality gate includes the new audit before root workflow coverage.
- Architecture board states 10.48/10 as controlled storage-commit evidence, not physical row verification, public release, true multi-model fusion, or a new performance benchmark.

## Performance Note

This slice is an in-process storage-commit probe through an injected use case port. It is intentionally not a new production10k benchmark. Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this slice advances durable teaching-material workflow correctness while preserving safety boundaries.

## Rollback

Remove the runtime, tests, audit, report registration, quality-gate entry, root workflow hook, structure-verifier entry, and architecture-board note. Existing append-only commit logs are idempotent evidence and can be ignored by later row-verification slices if this boundary is replaced.
