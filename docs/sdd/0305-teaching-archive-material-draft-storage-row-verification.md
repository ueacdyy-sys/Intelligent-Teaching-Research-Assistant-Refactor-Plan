# SDD 0305: Teaching Archive Material Draft Storage Row Verification

## Problem

SDD 0304 commits an approved Teaching Archive material draft through the injected `TeachingArchiveCreateItemPort.createArchiveItem` use case port. That proves the write boundary returned a persisted archive item, but it still leaves one evidence gap: the committed item has not been verified as a physical `teaching_archive_items` row shape.

This slice closes that gap without repeating production10k benchmarks. It verifies the committed archive item through an injected row-read port and Go repository evidence. It is not a JS direct database read.

## Scope

Add `TeachingArchiveMaterialDraftStorageRowVerificationPort.verifyTeachingArchivePhysicalRow`.

The runtime consumes only a READY `TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT` report with `TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMITTED`. It requires `TeachingArchiveRowReadPort.getArchiveItemById`, expects the read port result to identify `ArchiveRepository.GetByID` and `teaching_archive_items`, and verifies the physical row fields match the committed archive item exactly.

The verified fields are id, owner type, student id, material type, title, source, content ref, tags, analysis intents, OCR status, and created at. The slice records append-only row verification evidence for idempotent replay and preserves storage commit evidence references.

It blocks direct database access, HTTP execution, OCR/RAG job writes, AI grading writes, external model calls, local tool mutation, remote device control, and Swarm.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT` with `TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMITTED`.
- Source commit boundary must have `mainDatabaseWriteCommitted=true`, `finalArchiveItemCreated=true`, `directDatabaseAccessAllowed=false`, and `executeHttpRequestAllowed=false`.
- Verification policy must require `storageCommitRequired=true`, `physicalRowVerificationRequired=true`, `injectedTeachingArchiveRowReadPortRequired=true`, `teachingArchiveRepositoryReadRequired=true`, `committedArchiveItemMatchRequired=true`, `preserveCommitEvidenceRequired=true`, `idempotentRowVerificationRequired=true`, and `mainDatabaseReadAllowed=true`.
- Verification policy must keep direct database access, HTTP execution, OCR/RAG writes, AI grading writes, external model calls, remote device control, local tool mutation, and Swarm disabled.
- Row read source must be `ArchiveRepository.GetByID` against `teaching_archive_items`.
- Runtime boundary sets `physicalDatabaseRowVerified=true` only after the committed archive item and returned physical row match exactly.
- The Go repository evidence is `ArchiveRepository.GetByID`, which selects from `teaching_archive_items` by `id = $1` and scans through `scanArchiveItem`.

## Acceptance Criteria

- Runtime tests cover successful row verification, idempotent replay, idempotency conflict, unsafe commit state, forbidden policy, missing port, missing row, row mismatch, leaked fields, forbidden analysis intent, and unsafe content refs.
- Go repository test proves `ArchiveRepository.GetByID` returns the `tarch_archive_material_001` physical row shape.
- Audit verifies source commit readiness, runtime identity, safety boundaries, one-port probe, tests, Go repository evidence, quality gate, root workflow coverage, structure verifier, SDD, and architecture board hooks.
- Root workflow coverage includes this slice in the Teaching Archive workflow and controlled Agent write workflow.
- Quality gate includes the new audit before root workflow coverage.
- Architecture board states 10.51/10 as physical row verification evidence, not product retrieval, OCR/RAG, AI grading, public release, true multi-model fusion, or a new performance benchmark.

## Performance Note

This slice is an in-process row-verification probe through an injected row read port. It is intentionally not a new production10k benchmark. Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this slice advances durable teaching-material workflow correctness while preserving safety boundaries.

## Rollback

Remove the runtime, tests, audit, report registration, Go repository row-shape test, quality-gate entry, root workflow hook, structure-verifier entry, and architecture-board note. Existing append-only verification logs are idempotent evidence and can be ignored by later product-retrieval slices if this boundary is replaced.
