# SDD 0312: Teaching Archive Material Publication Row Verification

## Problem

SDD 0311 commits a reviewed Teaching Archive material publication through an injected publication commit port. That proves a durable commit boundary, but it still does not prove the committed publication can be read back as a physical publication-store row.

This slice verifies the committed publication record through a read port. It advances the Teaching Archive publication chain without letting JavaScript execute SQL, HTTP, OCR/RAG enrichment, AI grading, model inference, local tool mutation, remote device control, or Swarm.

## Scope

Add `TeachingArchiveMaterialPublicationRowVerificationPort.verifyTeachingArchivePublicationPhysicalRow`.

The runtime consumes only a READY `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT` report with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED`. It calls only the injected `TeachingArchivePublicationRowReadPort.getPublicationById` and verifies that the returned row exactly matches the 0311 committed publication record.

The runtime records `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED`. Student App published-material read verification, OCR/RAG enrichment, AI grading, and model execution remain later reviewed slices.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT` with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED`.
- Source safety must prove publication persistence command verification, injected publication commit port, durable publication commit, student-visible publication, main database write commit, and student archive write commit.
- Source safety must keep raw database access, HTTP execution, OCR/RAG writes, AI grading writes, model inference, local tool mutation, remote device control, and Swarm disabled.
- Verification policy must require storage commit evidence, physical publication row verification, injected publication row read port, publication repository read, exact committed row match, approval and delivery evidence preservation, student own scope, idempotent verification, and main database read allowance.
- Verification policy must keep raw database access, HTTP execution, OCR/RAG, AI grading, model inference, local tool mutation, remote device control, and Swarm disabled.
- The returned physical row must match publication id, publication state, visibility state, channel, scope ref, approval id, publication candidate id, archive item id, student id, material type, title, content ref, and committed timestamp.

## Acceptance Criteria

- Runtime tests cover success, idempotent replay, idempotency conflict, unsafe source, unsafe policy, missing port, missing row, row mismatch, leaked fields, unsafe text, and unsafe content refs.
- Audit verifies 0311 source readiness, runtime identity, idempotency, no raw DB/HTTP/model/Swarm side effects, one row-read probe, tests, quality gate, root workflow coverage, structure verifier, SDD, and architecture board hooks.
- Root workflow coverage includes this slice in Teaching Archive and Student App workflows.
- Quality gate includes this audit before root workflow coverage.
- Architecture board states 10.72/10 as publication row verification evidence, not Student App published-material read, OCR/RAG enrichment, AI grading, true model inference, or a new production10k benchmark.

## Performance Note

This is an in-process injected-port row verification probe. It is intentionally not a production10k benchmark. Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; 50ms P99 is the current pass line, while 10ms P99 remains an aspirational production target.

## Rollback

Remove the runtime, tests, audit, report registration, quality-gate entry, root workflow hook, structure-verifier entry, and architecture-board note. Existing idempotent verification logs are evidence artifacts and can be ignored by a later Student App published-material read design if this boundary changes.
