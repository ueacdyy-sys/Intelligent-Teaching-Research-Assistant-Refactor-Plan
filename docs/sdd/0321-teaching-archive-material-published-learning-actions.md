# SDD 0321: Teaching Archive Material Published Learning Actions

## Problem

SDD 0320 gives the Student App a safe study packet for one published archive item. The root requirement also needs a personalized tutor and personalized question bank, but the material detail page must not directly invoke model inference, OCR/RAG, prompt construction, answer-key access, or Swarm.

The next safe product step is a small learning-action affordance contract. It lets the mobile Student App know which reviewed action entry points are available for this READY study packet while keeping all writes and asynchronous AI work behind the existing Student App AI tutor request queue.

## Scope

Add `GET /v1/student-app/archive-items/{archiveItemId}/learning-actions`.

The endpoint is backed by:

- domain affordance: `StudentAppArchiveItemLearningActions`
- use case: `ReadStudentAppArchiveItemLearningActions.Execute`
- detail repository read: `ArchiveRepository.GetPublishedForStudentApp`
- preview repository read: `ArchiveRepository.GetPublishedContentPreviewForStudentApp`
- existing action target: `POST /v1/student-app/ai-tutor-requests`
- OpenAPI path: `teaching-archive.student-app-archive-item-learning-actions.path.yaml`

This slice does not create a new tutor request, question-bank draft, model job, RAG query, or content read. It only returns safe action metadata after the same READY study packet boundary is proven.

## Contracts

- Principal must be `USER/STUDENT/STUDENT_APP`, include `STUDENT_OWN_READ` and `TEACHING_READ`, and use own-student access.
- `archiveItemId` must be a safe `tarch_` token.
- Use case must read published metadata first through `GetPublishedForStudentApp`.
- If metadata is missing, preview must not be read.
- Use case must read preview only through `GetPublishedContentPreviewForStudentApp`.
- The study packet must be `READY`, render format must be `SAFE_TEXT_BLOCKS`, and metadata/preview must match `archiveItemId`, `materialType`, and `title`.
- Response may include only `archiveItemId`, `materialType`, `packetStatus`, and safe action affordances.
- Action targets may only point to `POST /v1/student-app/ai-tutor-requests`.
- Response must not include `studentId`, `contentRef`, content preview blocks, raw/full content fields, prompt text, OCR/RAG chunks, embeddings, answer keys, model output, publication metadata, approval metadata, worker state, scores, or internal errors.

## Acceptance Criteria

- Domain tests prove a READY study packet produces AI tutor and personalized-question-bank action affordances, and mismatched packets are rejected.
- Use case tests prove the detail port and safe preview port are used, forbidden principals do not trigger reads, and no generic archive read path is used.
- HTTP tests prove the endpoint returns only safe action affordances and rejects cross-student, teacher, and unsupported method cases.
- OpenAPI documents the endpoint and excludes ownership internals, `contentRef`, preview content, prompt, raw content, OCR/RAG, answer, model, worker, and publication fields.
- Audit verifies SDD 0320 readiness, Go domain/usecase/HTTP/OpenAPI, quality gate hook, root workflow coverage, structure verifier, root trace, and architecture board updates.
- Architecture board states 10.99/10 as the Student App learning action affordance foundation. It must not claim AI tutoring completion, question-bank generation, OCR/RAG enrichment, model inference, Swarm, or a new production10k benchmark.

## Performance Note

This is a two-read composition over the same indexed published metadata and safe preview paths used by SDD 0320, followed by in-process action mapping. It should stay under the 50ms runtime target and must not add model/RAG dependencies to the fast path. It is not a new production10k benchmark and does not change the current whole-system performance claim.

Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; 50ms P99 is the current pass line, while 10ms P99 remains the aspirational production target.

## Rollback

Remove the learning-actions domain/use case/HTTP/OpenAPI files and edits, SDD, audit, report, package script, quality-gate entry, root workflow hook, structure-verifier entry, root trace row, and architecture-board note. Keep SDD 0320 intact because the safe study packet remains useful without action affordances.
