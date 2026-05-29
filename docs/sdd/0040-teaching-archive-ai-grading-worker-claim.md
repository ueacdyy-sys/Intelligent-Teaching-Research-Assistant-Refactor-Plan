# SDD 0040: Teaching Archive AI Grading Worker Claim

## Problem

SDD 0038 can queue metadata-only AI grading requests and SDD 0039 can list their status. The next system boundary is worker intake: a future Python OCR, handwriting, rubric, or model worker needs a Go-owned way to claim exactly one pending AI grading request before doing any expensive or optional model-side work.

The root requirement keeps AI grading in Teaching Mode and reserves OCR or handwriting recognition for precise scoring. A worker claim endpoint makes that handoff explicit while keeping Python workers from polling the main database directly and keeping OCR/model/training dependencies out of the baseline runtime.

## Source Requirement References

- Root requirement: AI grading keeps existing functionality while reserving OCR or handwriting recognition for accurate scoring.
- Root requirement: archive materials include quizzes, papers, handouts, homework, and teaching materials.
- Root requirement: student archive data can be tracked and later analyzed.
- Whole-system map: Teaching Mode owns quiz, AI grading, archives, and worker handoff APIs.
- Whole-system map: AI Workers are Python behind a Job API and should not directly write or poll the main database.
- SDD 0038: Teaching Archive queues metadata-only AI grading requests.
- SDD 0039: Teaching Archive lists AI grading request status.

## Scope

In scope:

- Add a worker claim endpoint for one AI grading request at a time.
- Endpoint: `POST /v1/teaching/ai-grading-requests/worker-claims`.
- Allow only service principals from `AGENT_INTERNAL` with `TEACHING_WRITE`.
- Require a `workerId` and support a bounded `leaseSeconds`.
- Mark claimed work as `IN_PROGRESS`.
- Store `claimedByWorkerId`, `claimExpiresAt`, and `updatedAt`.
- Allow claiming the oldest `QUEUED` request or an expired `IN_PROGRESS` request.
- Return `204` when no eligible request is available.
- Keep OCR, handwriting recognition, rubric execution, model calls, scoring, and training artifacts out of this slice.

Out of scope:

- Python worker implementation.
- Actual OCR or handwriting recognition.
- Actual score/rubric generation.
- Result writeback endpoint.
- Dead-letter queues and retry policy.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.ai-grading-worker-claims.path.yaml`
- `contracts/sql/teaching-archive.sql`

Go service:

- `services/teaching-archive-gateway`
- Use case: `ClaimAIGradingRequest`

PostgreSQL adapter:

- Add lease metadata columns to `teaching_ai_grading_requests`.
- Claim one eligible row with atomic `UPDATE ... FOR UPDATE SKIP LOCKED ... RETURNING`.

## Acceptance Criteria

- Domain tests prove a queued AI grading request can be claimed with a normalized worker ID and lease deadline.
- Domain tests prove active leases cannot be claimed.
- Use-case tests prove only an internal service principal can claim work.
- Use-case tests prove an empty queue returns no claim without error.
- HTTP tests prove worker claim returns stable `200` response fields.
- HTTP tests prove an empty queue returns `204`.
- PostgreSQL adapter uses a single atomic `UPDATE ... FOR UPDATE SKIP LOCKED ... RETURNING` claim shape.
- PostgreSQL adapter can claim expired in-progress work but not active leases.
- Structure verification requires SDD 0040 and the new claim use-case/test files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove the AI grading worker claim endpoint, claim metadata fields, claim use case, PostgreSQL claim method/indexes, `IN_PROGRESS` status, SDD 0040 structure checks, and tests. SDD 0038 request creation and SDD 0039 query view remain intact.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
