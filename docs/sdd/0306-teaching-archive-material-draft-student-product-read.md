# SDD 0306: Teaching Archive Material Draft Student Product Read

## Problem

SDD 0305 proves that the approved Teaching Archive material draft exists as a physical `teaching_archive_items` row. That is still not enough for the product: the student app must be able to read the same archive item through its product entry without leaking another student's archive or collapsing into publication, OCR/RAG, AI grading, model inference, or Swarm execution.

This slice advances the workflow from physical row verification to student app product read evidence. It does not repeat production10k benchmarks.

## Scope

Add `TeachingArchiveMaterialDraftStudentProductReadPort.verifyStudentAppArchiveItemsRead`.

The runtime consumes only a READY `TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION` report with `TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PHYSICAL_ROW_VERIFIED`. It requires an own-student `STUDENT_APP` principal with `STUDENT_OWN_READ`, then calls an injected `StudentAppArchiveItemsProductReadPort.listStudentAppArchiveItems`.

The runtime verifies that the product read source maps to `GET /v1/student-app/archive-items`, `ListStudentAppArchiveItems.Execute`, and `ArchiveRepository.List`; the response must include the same `tarch_archive_material_001` row fields and must not contain cross-student or teaching-material leakage.

It blocks direct database access, HTTP execution from JS, OCR/RAG job writes, AI grading writes, model inference, publication, local tool mutation, remote device control, and Swarm.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION` with `TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PHYSICAL_ROW_VERIFIED`.
- Source invariants must have `physicalDatabaseRowVerified=true`, `teachingArchiveRepositoryGetByIDUsed=true`, `directDatabaseAccessAllowed=false`, and `executeHttpRequestAllowed=false`.
- Principal must be `USER/STUDENT/STUDENT_APP`, include `STUDENT_OWN_READ`, and resolve to the same student id as the verified row.
- Product read policy must require row verification, own-student principal, student app archive-items endpoint, injected product read port, own-student-only scope, exact verified-row inclusion, idempotent verification, and Go use-case read.
- Product read policy must keep direct database access, HTTP execution, OCR/RAG writes, AI grading writes, model inference, publication, remote device control, local tool mutation, and Swarm disabled.
- Product read source must be `GET /v1/student-app/archive-items`, `ListStudentAppArchiveItems.Execute`, and `ArchiveRepository.List`.
- Runtime boundary sets `ownStudentProductReadVerified=true` only after the product response includes the exact verified row and no out-of-scope student archive.

## Acceptance Criteria

- Runtime tests cover successful product read, idempotent replay, idempotency conflict, missing port, cross-student principal, missing product row, mismatched response, unsafe policy, leaked fields, unsafe text, missing row evidence, missing product entry evidence, and future-gated publication/RAG/model work.
- Go HTTP test proves `/v1/student-app/archive-items` can return the 0305 committed row shape `tarch_archive_material_001` to `student_001` and not leak other students or teaching materials.
- Audit verifies source row readiness, runtime identity, safety boundaries, one-port probe, tests, Go domain/usecase/HTTP/OpenAPI/repository evidence, quality gate, root workflow coverage, structure verifier, SDD, and architecture board hooks.
- Root workflow coverage includes this slice in both Teaching Archive and Student App workflows.
- Quality gate includes the new audit before root workflow coverage.
- Architecture board states 10.54/10 as student product read evidence, not publication, OCR/RAG, AI grading, public release, true multi-model fusion, or a new performance benchmark.

## Performance Note

This slice is an in-process product-read verification probe through an injected port. It is intentionally not a new production10k benchmark. Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this slice advances product correctness after the durable teaching-material write chain.

## Rollback

Remove the runtime, tests, audit, report registration, Go HTTP row-shape test, quality-gate entry, root workflow hook, structure-verifier entry, and architecture-board note. Existing append-only verification logs are idempotent evidence and can be ignored by later publication or retrieval slices if this boundary is replaced.
