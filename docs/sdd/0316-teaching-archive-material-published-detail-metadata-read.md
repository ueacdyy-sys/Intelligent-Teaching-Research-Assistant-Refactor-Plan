# SDD 0316: Teaching Archive Material Published Detail Metadata Read

## Problem

SDD 0315 lets the Student App list and search published archive material metadata. The next root-product gap is the selected-item detail read: after a student chooses one published archive item, the product needs a stable detail endpoint that returns safe metadata for that one item.

This must not become a raw material read path. The detail endpoint must stay scoped to the authenticated student's own published material, must use the `teaching_archive_publications` visible publication projection, and must not expose raw content, `contentRef`, answer keys, model output, publication IDs or states, approval metadata, worker state, internal errors, OCR/RAG content, or storage internals.

## Scope

Add `TeachingArchiveMaterialPublishedDetailMetadataReadPort.verifyStudentAppPublishedMaterialDetailMetadataRead`.

This slice consumes only a READY `TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION` report with `TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_VERIFIED`. It verifies detail metadata read through an injected `StudentAppPublishedMaterialDetailMetadataReadPort.getPublishedArchiveMaterialMetadata`.

The Go product path adds `GET /v1/student-app/archive-items/{archiveItemId}`. The URL path id is normalized at the domain boundary, must use the `tarch_` safe id token shape, and is read through `ReadStudentAppArchiveItem.Execute`. The use case calls only `ArchiveRepository.GetPublishedForStudentApp(ctx, archiveItemID, studentID)`, which filters by `teaching_archive_publications` and the authenticated student's id.

This slice does not add full material content retrieval, preview rendering, OCR/RAG, semantic search, AI grading linkage, model inference, publication writes, remote device control, local tool mutation, or Swarm.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION` with `TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_VERIFIED`.
- Principal must be `USER/STUDENT/STUDENT_APP`, include `STUDENT_OWN_READ`, and resolve to the same student as the published archive item.
- `archiveItemId` must normalize to a `tarch_` id token containing only letters, digits, `_`, and `-`.
- Detail source must be `GET /v1/student-app/archive-items/{archiveItemId}`, `ReadStudentAppArchiveItem.Execute`, and `ArchiveRepository.GetPublishedForStudentApp`.
- Repository evidence must prove the query binds `item.id`, `item.student_id`, and the Student App visible publication projection.
- Product response may include only safe archive item metadata: id, ownerType, studentId, materialType, title, source, tags, analysisIntents, ocrStatus, createdAt.
- Product response must not include `contentRef`, publication IDs, publication state, visibility state, approval metadata, raw content, answer keys, model output, worker state, result refs, or internal errors.
- Runtime must keep direct database access, HTTP execution, full-text content reads, OCR/RAG writes, AI grading writes, model inference, publication writes, remote device control, local tool mutation, and Swarm disabled.

## Acceptance Criteria

- Runtime tests cover successful safe detail metadata read, idempotent replay, idempotency conflict, unsafe source report, unsafe policy, missing port, unsafe `archiveItemId`, missing expected material, generic repository misuse, cross-student leak, unpublished leak, missing projection proof, product metadata leak, contentRef leak, model output leak, and missing evidence refs.
- OpenAPI exposes `GET /v1/student-app/archive-items/{archiveItemId}` with a `tarch_` path id pattern and `StudentAppArchiveItemMetadataResponse` that excludes `contentRef`.
- Go domain input includes `ReadStudentAppArchiveItemInput`, normalizes `ArchiveItemID`, enforces the Student App principal and `tarch_` token shape, and rejects non Student App principals.
- Use case calls only `GetPublishedForStudentApp` and maps a missing projection row to `ErrNotFound`.
- PostgreSQL repository uses `teaching_archive_publications` `EXISTS` filtering with `item.id`, `item.student_id`, Student App channel, committed publication state, and student-visible visibility state.
- HTTP route handles `/v1/student-app/archive-items/{archiveItemId}`, returns safe metadata, rejects unsupported methods, and does not leak `contentRef` or publication internals.
- Audit verifies 0315 source readiness, runtime identity, runtime probe, Go/OpenAPI/Postgres/HTTP evidence, tests, package script, quality gate, root workflow coverage, structure verifier, SDD, and architecture board hooks.
- Root workflow coverage includes this slice in both Teaching Archive and Student App workflows.
- Architecture board states 10.84/10 as published-material detail metadata read evidence, not raw content preview, OCR/RAG enrichment, AI grading linkage, full material retrieval, Swarm, or a new production10k benchmark.

## Performance Note

This is not a new production10k benchmark. The added product path is a single indexed point lookup plus a publication projection `EXISTS` filter. It should be lower risk than broad metadata search and should not change the current whole-system performance claim.

Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; 50ms P99 is the current pass line, while 10ms P99 remains the aspirational production target.

## Rollback

Remove the Student App detail route, `ReadStudentAppArchiveItem` use case, `ReadStudentAppArchiveItemInput` normalization, `ArchiveRepository.GetPublishedForStudentApp`, OpenAPI path/schema additions, runtime, tests, audit, report registration, quality-gate entry, root workflow hook, structure-verifier entry, and architecture-board note.
