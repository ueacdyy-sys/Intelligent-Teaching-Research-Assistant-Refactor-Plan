# SDD 0038: Teaching Archive AI Grading Request Intake

## Problem

The root requirement keeps AI grading in Teaching Mode and reserves OCR or handwriting recognition for precise scoring. SDD 0029 can store archive metadata with `AI_GRADING` intent and an OCR reservation, but there is still no Go-owned job boundary for asking a worker to grade a quiz, paper, or homework archive item.

Without that boundary, a future Python OCR/model worker would either poll archive rows directly or couple model-specific dependencies into the baseline gateway. The refactor needs a metadata-only request intake so teacher/student surfaces can queue grading work while OCR, handwriting recognition, rubric interpretation, scoring, and model execution stay outside the baseline runtime.

## Source Requirement References

- Root requirement: AI grading keeps existing functionality while reserving OCR or handwriting recognition for accurate scoring.
- Root requirement: archive materials include quizzes, papers, handouts, homework, and teaching materials.
- Root requirement: student archive data can be tracked and later analyzed.
- Whole-system map: Teaching Mode owns quiz, AI grading, archives, and worker handoff APIs.
- Whole-system map: AI Workers are Python behind a Job API and should not directly write or poll the main database.
- SDD 0029: Teaching Archive material intake stores archive metadata and `AI_GRADING` intent without OCR/model dependencies.

## Scope

In scope:

- Add a metadata-only AI grading request resource for archive items.
- Endpoint: `POST /v1/teaching/archive-items/{archiveItemId}/ai-grading-requests`.
- Allow a teacher with archive read/write access to queue grading for assigned student archive material.
- Allow a student to queue grading only for the student's own archive material.
- Require the source archive item to carry `AI_GRADING` intent.
- Require the source archive material to be a student quiz, paper, or homework item.
- Store source archive ownership/material metadata on the request for later scoped reads.
- Keep OCR, handwriting recognition, scoring, rubric execution, model calls, and result writeback out of this slice.

Out of scope:

- AI grading worker claim/result endpoints.
- Actual OCR or handwriting recognition.
- Actual score/rubric generation.
- Quiz creation, answer submission, or QR-code flows.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/sql/teaching-archive.sql`

Go service:

- `services/teaching-archive-gateway`
- Use case: `CreateAIGradingRequest`

PostgreSQL adapter:

- Add `teaching_ai_grading_requests` for metadata-only queued grading work.
- No archive file content is read by the gateway.

## Acceptance Criteria

- Domain tests prove AI grading requests are created with `QUEUED` status and source archive metadata.
- Domain tests reject archive material that is not eligible for AI grading.
- Domain/use-case tests prove teacher/student authorization follows archive read access.
- HTTP tests prove the archive-item subresource returns `201` with an AI grading request response.
- PostgreSQL adapter tests prove request insertion stores only metadata and uses the new table.
- Structure verification requires SDD 0038.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0038, remove the AI grading request OpenAPI path and schemas, remove the SQL table/indexes, remove domain/use-case/HTTP/PostgreSQL wiring and tests, and remove the structure verifier entries. SDD 0029 archive intake and the tutoring analysis request chain remain intact.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
