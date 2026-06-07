# SDD 0320: Teaching Archive Material Published Study Packet

## Problem

SDD 0316 gives Student App safe published archive item metadata. SDD 0319 gives a safe text-block preview envelope. A student-facing material detail page still needs a single stable contract that combines those two reviewed read paths without forcing the frontend to assemble unsafe or inconsistent fragments.

The next step is not full material retrieval, raw content rendering, OCR/RAG enrichment, semantic retrieval, or AI tutoring. It is a narrow study packet that lets Student App show one published student archive item with safe metadata and `SAFE_TEXT_BLOCKS` preview blocks.

## Scope

Add `GET /v1/student-app/archive-items/{archiveItemId}/study-packet`.

The endpoint is backed by:

- domain packet: `StudentAppArchiveItemStudyPacket`
- use case: `ReadStudentAppArchiveItemStudyPacket.Execute`
- detail repository read: `ArchiveRepository.GetPublishedForStudentApp`
- preview repository read: `ArchiveRepository.GetPublishedContentPreviewForStudentApp`
- render format: `SAFE_TEXT_BLOCKS`
- OpenAPI path: `teaching-archive.student-app-archive-item-study-packet.path.yaml`

This slice does not add a database table. It composes the 0316 and 0319 safe read boundaries and rejects inconsistent metadata or preview rows.

## Contracts

- Principal must be `USER/STUDENT/STUDENT_APP`, include `STUDENT_OWN_READ`, and use own-student access.
- `archiveItemId` must be a safe `tarch_` token.
- Use case must read published metadata first through `GetPublishedForStudentApp`.
- If metadata is missing, preview must not be read.
- Use case must read preview only through `GetPublishedContentPreviewForStudentApp`.
- Metadata and preview must match `archiveItemId`, `materialType`, and `title`.
- Response may include only `packetStatus`, safe `archiveItem` metadata, and safe `contentPreview`.
- Response must not include `studentId`, `contentRef`, raw/full content fields, rendered HTML/Markdown, object storage keys, OCR/RAG chunks, embeddings, answer keys, model output, publication metadata, approval metadata, worker state, scores, or internal errors.

## Acceptance Criteria

- Domain tests prove safe metadata and rendered preview combine into a READY study packet, and mismatched preview metadata is rejected.
- Use case tests prove the detail port and safe preview port are used, missing detail short-circuits preview reads, forbidden principals do not trigger reads, and preview mismatch is rejected.
- HTTP tests prove the endpoint returns safe metadata plus text blocks and rejects cross-student, teacher, and unsupported method cases.
- OpenAPI documents the endpoint and excludes ownership internals, `contentRef`, raw content, HTML/Markdown, OCR/RAG, answer, model, worker, and publication fields.
- Audit verifies SDD 0319 readiness, Go domain/usecase/HTTP/OpenAPI, quality gate hook, root workflow coverage, structure verifier, root trace, and architecture board updates.
- Architecture board states 10.96/10 as the Student App archive item study packet foundation. It must not claim full material retrieval, OCR/RAG enrichment, semantic retrieval, AI tutoring completion, model inference, Swarm, or a new production10k benchmark.

## Performance Note

This is a two-read composition over indexed published metadata and safe preview paths, followed by in-process mapping. It should stay under the 50ms runtime target. It is not a new production10k benchmark and does not change the current whole-system performance claim.

Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; 50ms P99 is the current pass line, while 10ms P99 remains the aspirational production target.

## Rollback

Remove the study packet domain/use case/HTTP/OpenAPI files and edits, SDD, audit, report, package script, quality-gate entry, root workflow hook, structure-verifier entry, root trace row, and architecture-board note. Keep SDD 0316 and 0319 intact because metadata and rendered preview remain useful independent safe read paths.
