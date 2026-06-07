# SDD 0318: Teaching Archive Material Published Content Preview Read Foundation

## Problem

SDD 0317 blocks Student App published-material content preview until a reviewed safe preview store and renderer exist. The next safe step is not raw material retrieval. The system needs a narrow content-preview read foundation that serves only pre-sanitized preview sections for the authenticated student's own published archive item.

Without a dedicated store and endpoint, content preview would be tempted to read `contentRef`, object storage, OCR text, RAG chunks, answer keys, publication internals, worker state, or model output. This slice creates the safe read boundary before any richer rendering or semantic retrieval work.

## Scope

Add `GET /v1/student-app/archive-items/{archiveItemId}/content-preview`.

The endpoint is backed by:

- domain model: `PublishedArchiveMaterialContentPreview`
- use case: `ReadStudentAppArchiveItemContentPreview.Execute`
- repository write foundation: `ArchiveRepository.SavePublishedArchiveMaterialContentPreview`
- repository read: `ArchiveRepository.GetPublishedContentPreviewForStudentApp`
- PostgreSQL table: `teaching_archive_material_content_previews`
- OpenAPI path: `teaching-archive.student-app-archive-item-content-preview.path.yaml`

This slice reads only safe reviewed preview rows from the dedicated preview table and only after `teaching_archive_publications` proves the archive item is committed, visible, own-student, and in the Student App channel.

This slice does not read raw content, expose `contentRef`, access object storage, start OCR/RAG, perform semantic retrieval, call a model, read answer keys, write AI grading state, write publication state, mutate local tools, control remote devices, or start Swarm.

## Contracts

- Principal must be `USER/STUDENT/STUDENT_APP`, include `STUDENT_OWN_READ`, and use own-student access.
- `archiveItemId` must be a safe `tarch_` token.
- Repository read must require `preview.archive_item_id = $1`, `preview.student_id = $2`, `preview.preview_status = 'READY'`, and an `EXISTS` filter over `teaching_archive_publications`.
- Publication filter must require `STUDENT_OWN_ARCHIVE`, `COMMITTED_TO_PUBLICATION_STORE`, `STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED`, and `STUDENT_APP`.
- Response may include only `archiveItemId`, `materialType`, `title`, `previewStatus`, `sections`, `createdAt`, and `updatedAt`.
- Response must not include `studentId`, `contentRef`, raw/full content fields, object storage keys, OCR/RAG chunks, embeddings, answer keys, model output, publication metadata, approval metadata, worker state, scores, or internal errors.
- Preview sections must be bounded, sanitized text with stable IDs, titles, optional page hints, and no HTML/script-like transport.

## Acceptance Criteria

- Domain tests cover own-student normalization, safe preview normalization, unsafe text rejection, duplicate/oversize section rejection, timestamp requirement, and cross-student/wrong-item rejection.
- Use case tests prove the dedicated preview repository port is used, missing preview maps to not found, forbidden principals do not trigger a read, and repository leaks are rejected.
- Postgres tests prove the table/index exist, writes upsert JSONB sections, and reads use the visible publication projection without `SELECT *` or `content_ref`.
- HTTP tests prove the endpoint returns safe sections and rejects cross-student, unpublished, teacher, unsafe ID, and unsupported method cases.
- OpenAPI documents the endpoint and inline safe response contract without adding `contentRef` or student ownership leakage.
- Audit verifies SDD 0317 readiness, Go domain/usecase, Postgres schema/read, HTTP/OpenAPI, quality gate hook, root workflow coverage, structure verifier, root trace, and architecture board updates.
- Architecture board states 10.90/10 as a safe content preview store/read foundation. It must not claim full material retrieval, OCR/RAG enrichment, semantic retrieval, AI grading linkage, model inference, Swarm, or a new production10k benchmark.

## Performance Note

This is a small indexed read path over a preview table plus a publication-projection `EXISTS` check. It should stay under the 50ms runtime target. It is not a new production10k benchmark and does not change the current whole-system performance claim.

Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; 50ms P99 is the current pass line, while 10ms P99 remains the aspirational production target.

## Rollback

Remove the content preview domain/use case/repository/HTTP/OpenAPI files, schema statements, SDD, audit, report, package script, quality-gate entry, root workflow hook, structure-verifier entry, root trace row, and architecture-board note. Keep SDD 0316 metadata read and SDD 0317 preview precheck intact because those still safely block or describe the boundary without content preview.
