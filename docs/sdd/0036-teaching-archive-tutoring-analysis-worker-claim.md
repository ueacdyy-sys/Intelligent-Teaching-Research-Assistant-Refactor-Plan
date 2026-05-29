# SDD 0036: Teaching Archive Tutoring Analysis Worker Claim

## Problem

SDD 0033 can queue tutoring analysis requests, SDD 0034 can list their status, and SDD 0035 can record worker result metadata. The remaining gap in this path is safe worker intake: Python AI workers still need a Go-owned way to claim exactly one pending tutoring analysis request before running OCR, RAG, model, or personalized-question generation outside the baseline runtime.

The root requirement needs archive material to flow into tutoring mode for ability visualization, progress analysis, and later personalized question-bank checks. A worker claim boundary keeps that flow explicit while preventing Python workers from polling tables directly or importing model dependencies into the Go gateway.

## Source Requirement References

- Root requirement: archive material can be transferred to tutoring mode for analysis.
- Root requirement: personalized tutoring assistant can visualize student ability and analyze progress.
- Root requirement: tutoring mode should add a personalized question bank to detect student level after tutoring.
- Root requirement: AI/RAG/OCR/model dependencies remain worker-side concerns.
- Whole-system map: AI Workers are Python behind a Job API and should not directly write or poll the main database.
- SDD 0033: Teaching Archive queues metadata-only tutoring analysis requests.
- SDD 0034: Teaching Archive lists tutoring analysis request status.
- SDD 0035: Teaching Archive records metadata-only worker results.

## Scope

In scope:

- Add a worker claim endpoint for one tutoring analysis request at a time.
- Endpoint: `POST /v1/teaching/tutoring-analysis-requests/worker-claims`.
- Allow only service principals from `AGENT_INTERNAL` with `TEACHING_WRITE`.
- Require a `workerId` and support a bounded `leaseSeconds`.
- Mark claimed work as `IN_PROGRESS`.
- Store `claimedByWorkerId`, `claimExpiresAt`, and `updatedAt`.
- Allow claiming the oldest `QUEUED` request or an expired `IN_PROGRESS` request.
- Return `204` when no eligible request is available.
- Keep OCR/RAG/model execution, generated questions, and training artifacts out of this slice.

Out of scope:

- Python worker implementation.
- Running OCR/RAG/model calls.
- Generated personalized question content.
- Result writeback ownership validation by worker lease; this is implemented by SDD 0037.
- Dead-letter queues and retry policy.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/sql/teaching-archive.sql`

Go service:

- `services/teaching-archive-gateway`
- Use case: `ClaimTutoringAnalysisRequest`

## Acceptance Criteria

- Domain tests prove a queued request can be claimed with a normalized worker ID and lease deadline.
- Domain tests prove final requests cannot be claimed.
- Use-case tests prove only an internal service principal can claim work.
- Use-case tests prove an empty queue returns no claim without error.
- HTTP tests prove worker claim returns stable `200` response fields.
- HTTP tests prove an empty queue returns `204`.
- PostgreSQL adapter uses a single atomic `UPDATE ... FOR UPDATE SKIP LOCKED ... RETURNING` claim shape.
- PostgreSQL adapter can claim expired in-progress work but not active leases.
- Structure verification requires SDD 0036 and the new claim use-case/test files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove the worker claim endpoint, claim metadata fields, claim use case, PostgreSQL claim method, `IN_PROGRESS` status, SDD 0036 structure checks, and tests. SDD 0033 request creation, SDD 0034 query view, and SDD 0035 result writeback remain intact.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
