# SDD 0044: Teaching Archive AI Grading Worker Result

## Problem

SDD 0038 queues metadata-only AI grading requests, SDD 0039 exposes their query view, and SDD 0040 lets an internal worker claim one request with a bounded lease. The remaining boundary is result writeback: after a future worker performs OCR, handwriting recognition, rubric evaluation, or model-side scoring, the Go-owned Teaching Archive must accept only completion metadata through a stable contract.

The root requirement keeps AI grading inside Teaching Mode and reserves OCR or handwriting recognition for precise scoring. This slice closes the worker lifecycle without adding OCR, model, training, RAG, or scoring dependencies to the baseline gateway.

## Source Requirement References

- Root requirement: AI grading keeps existing functionality while reserving OCR or handwriting recognition for accurate scoring.
- Root requirement: archive materials include quizzes, papers, handouts, homework, and teaching materials.
- Root requirement: student archive data can be tracked and later analyzed.
- Whole-system map: Teaching Mode owns quiz, AI grading, archives, and worker handoff APIs.
- Whole-system map: AI Workers are Python behind a Job API and should not directly write or poll the main database.
- SDD 0038: Teaching Archive queues metadata-only AI grading requests.
- SDD 0039: Teaching Archive lists AI grading request status.
- SDD 0040: Teaching Archive lets an internal worker claim AI grading work.

## Scope

In scope:

- Add a worker result endpoint for AI grading request completion metadata.
- Endpoint: `POST /v1/teaching/ai-grading-requests/{requestId}/worker-result`.
- Allow only service principals from `AGENT_INTERNAL` with `TEACHING_WRITE`.
- Require `workerId` so only the current lease holder can write the result.
- Support final statuses `SUCCEEDED` and `FAILED`.
- For success, require `scoreSummary` and `resultRef`.
- For failure, require `errorMessage` and optionally store `errorCode`.
- Store result metadata, `completedAt`, and `updatedAt`.
- Reject stale, expired, foreign-worker, or already-final writeback attempts with conflict.
- Keep OCR, handwriting recognition, rubric execution, model calls, scoring implementation, RAG, and training artifacts out of this slice.

Out of scope:

- Python worker implementation.
- Actual OCR or handwriting recognition.
- Actual score/rubric generation.
- Retry, dead-letter, or worker-heartbeat policy.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.ai-grading-worker-result.path.yaml`
- `contracts/sql/teaching-archive.sql`

Go service:

- `services/teaching-archive-gateway`
- Use case: `RecordAIGradingResult`

PostgreSQL adapter:

- Add result metadata columns to `teaching_ai_grading_requests`.
- Record result metadata with an atomic lease-guarded `UPDATE`.

## Acceptance Criteria

- Domain tests prove success metadata marks an actively claimed AI grading request as `SUCCEEDED`.
- Domain tests prove failed metadata requires an error message.
- Domain tests prove foreign-worker and expired-lease writeback attempts return conflict.
- Use-case tests prove only an internal service principal can write worker results.
- Use-case tests prove final requests cannot be overwritten.
- HTTP tests prove worker result writeback returns stable `200` response fields.
- HTTP tests prove teacher/student/remote principals cannot write worker results.
- HTTP tests prove missing `workerId` returns `422`.
- PostgreSQL adapter updates result metadata without reading archive file content.
- PostgreSQL adapter keeps the same lease guard in the atomic update.
- Structure verification requires SDD 0044 and the new result use-case/test files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove the AI grading worker result endpoint, result metadata fields, result use case, PostgreSQL update method/columns, OpenAPI path, SDD 0044 structure checks, and tests. SDD 0038 request creation, SDD 0039 query view, and SDD 0040 worker claim remain intact.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
