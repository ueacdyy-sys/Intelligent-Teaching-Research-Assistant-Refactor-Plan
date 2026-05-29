# SDD 0035: Teaching Archive Tutoring Analysis Worker Result

## Problem

SDD 0033 can queue tutoring analysis requests, and SDD 0034 can list their status. The root requirement needs archive material to flow into tutoring mode so the system can visualize student ability, analyze progress, and later prepare personalized question-bank checks.

The next boundary is a metadata-only worker result writeback. Python AI workers must be able to record completion metadata through a Go-owned contract without importing OCR, RAG, model, or training dependencies into the baseline runtime, and without writing directly to the main database.

## Source Requirement References

- Root requirement: archive material can be transferred to tutoring mode for analysis.
- Root requirement: personalized tutoring assistant can visualize ability and analyze progress.
- Root requirement: tutoring mode should add a personalized question bank to detect student level after tutoring.
- Root requirement: AI/RAG/OCR/model dependencies remain worker-side concerns.
- Whole-system map: AI Workers are Python behind a Job API and should not directly write the main database.
- SDD 0033: Teaching Archive queues metadata-only tutoring analysis requests.
- SDD 0034: Teaching Archive lists tutoring analysis request status.

## Scope

In scope:

- Add a worker result endpoint for tutoring analysis request completion metadata.
- Endpoint: `POST /v1/teaching/tutoring-analysis-requests/{requestId}/worker-result`.
- Allow only service principals from `AGENT_INTERNAL` with `TEACHING_WRITE`.
- Support final statuses `SUCCEEDED` and `FAILED`.
- For success, require `resultSummary` and `resultRef`; optionally store `questionBankDraftRef` when the request reserved `GENERATE_PERSONALIZED_CHECK`.
- For failure, require `errorMessage` and optionally store `errorCode`.
- Store result metadata, `completedAt`, and `updatedAt`.
- Keep model execution, OCR/RAG, generated questions, and training artifacts out of this slice.

Note: SDD 0037 tightens this result writeback so a worker result must match an active worker claim lease.

Out of scope:

- Worker queue claiming.
- Running OCR/RAG/model calls.
- Generating actual personalized question content.
- TypeScript SDK generation.
- Python worker implementation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/sql/teaching-archive.sql`

Go service:

- `services/teaching-archive-gateway`
- Use case: `RecordTutoringAnalysisResult`

## Acceptance Criteria

- Domain tests prove success metadata marks an eligible tutoring analysis request as `SUCCEEDED`.
- Domain tests prove failed metadata requires an error message.
- Domain/use-case tests prove only an internal service principal can write worker results.
- Use-case tests prove final requests cannot be overwritten.
- HTTP tests prove worker result writeback returns stable `200` response fields.
- HTTP tests prove teacher/student/remote principals cannot write worker results.
- PostgreSQL adapter updates result metadata without reading archive file content.
- Structure verification requires SDD 0035 and the new result use-case/test files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove the worker result endpoint, result metadata fields, result use case, PostgreSQL update method, SDD 0035 structure checks, and tests. SDD 0033 request creation and SDD 0034 query view remain intact.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
