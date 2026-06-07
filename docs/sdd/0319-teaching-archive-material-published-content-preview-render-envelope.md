# SDD 0319: Teaching Archive Material Published Content Preview Render Envelope

## Problem

SDD 0318 proves that Student App can read only pre-sanitized published archive material preview sections. The next product step is not raw/full content rendering. The system needs a narrow render envelope that converts those reviewed sections into stable, front-end-safe text blocks without introducing HTML, Markdown, object storage reads, OCR/RAG, model calls, answer keys, or Swarm.

Without this boundary, later UI work could be tempted to render raw content or to treat preview text as trusted HTML. This slice makes the rendering format explicit and keeps it under the same own-student publication projection used by 0318.

## Scope

Add `GET /v1/student-app/archive-items/{archiveItemId}/content-preview/rendered`.

The endpoint is backed by:

- render format: `SAFE_TEXT_BLOCKS`
- domain envelope: `PublishedArchiveMaterialContentPreviewRenderEnvelope`
- use case: `RenderStudentAppArchiveItemContentPreview.Execute`
- repository read: `ArchiveRepository.GetPublishedContentPreviewForStudentApp`
- OpenAPI path: `teaching-archive.student-app-archive-item-content-preview-rendered.path.yaml`

This slice reuses the 0318 safe preview read foundation and only maps safe reviewed preview sections into bounded text blocks. It does not add a database table, read `contentRef`, access object storage, render HTML/Markdown, start OCR/RAG, perform semantic retrieval, call a model, read answer keys, write AI grading state, write publication state, mutate local tools, control remote devices, or start Swarm.

## Contracts

- Principal must be `USER/STUDENT/STUDENT_APP`, include `STUDENT_OWN_READ`, and use own-student access.
- `archiveItemId` must be a safe `tarch_` token.
- Use case must call only `GetPublishedContentPreviewForStudentApp`.
- Render output must use `SAFE_TEXT_BLOCKS` and `SECTION` blocks.
- Response may include only `archiveItemId`, `materialType`, `title`, `previewStatus`, `renderFormat`, `blocks`, `createdAt`, and `updatedAt`.
- Response must not include `studentId`, `contentRef`, raw/full content fields, rendered HTML/Markdown, object storage keys, OCR/RAG chunks, embeddings, answer keys, model output, publication metadata, approval metadata, worker state, scores, or internal errors.
- Blocks must preserve section IDs, titles, text, and optional page hints from the reviewed preview store.

## Acceptance Criteria

- Domain tests prove safe sections become `SAFE_TEXT_BLOCKS` and cross-student repository leaks are rejected.
- Use case tests prove the 0318 preview repository port is reused, missing preview maps to not found, forbidden principals do not trigger a read, and repository leaks are rejected.
- HTTP tests prove the rendered endpoint returns safe text blocks and rejects cross-student, teacher, and unsupported method cases.
- OpenAPI documents the endpoint and excludes raw content, `contentRef`, `studentId`, HTML/Markdown, OCR/RAG, answer, model, worker, and publication fields.
- Audit verifies SDD 0318 readiness, Go domain/usecase/HTTP/OpenAPI, quality gate hook, root workflow coverage, structure verifier, root trace, and architecture board updates.
- Architecture board states 10.93/10 as a safe preview render envelope. It must not claim full material retrieval, OCR/RAG enrichment, semantic retrieval, AI grading linkage, model inference, Swarm, or a new production10k benchmark.

## Performance Note

This is a small in-process mapping over the 0318 indexed preview read path. It should stay under the 50ms runtime target. It is not a new production10k benchmark and does not change the current whole-system performance claim.

Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; 50ms P99 is the current pass line, while 10ms P99 remains the aspirational production target.

## Rollback

Remove the render envelope domain/use case/HTTP/OpenAPI files and edits, SDD, audit, report, package script, quality-gate entry, root workflow hook, structure-verifier entry, root trace row, and architecture-board note. Keep SDD 0318 read foundation intact because it still safely serves reviewed preview sections without rendering.
