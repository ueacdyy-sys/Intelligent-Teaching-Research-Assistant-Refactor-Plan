# SDD 0039: Teaching Archive AI Grading Query View

## Problem

SDD 0038 lets an authorized teacher or student queue a metadata-only AI grading request for eligible student archive material. The root requirement keeps AI grading in Teaching Mode and reserves OCR or handwriting recognition for precise scoring, but teacher and student surfaces still need a safe way to see queued grading request status before any worker is attached.

Without a query/status view, UI code would either poll archive rows indirectly or require worker-specific storage knowledge. The refactor needs a Go-owned list endpoint that exposes request metadata, preserves student scoping, and keeps OCR/model/training dependencies outside the baseline runtime.

## Source Requirement References

- Root requirement: AI grading keeps existing functionality while reserving OCR or handwriting recognition for accurate scoring.
- Root requirement: archive materials include quizzes, papers, handouts, homework, and teaching materials.
- Root requirement: student archive data can be tracked and later analyzed.
- Root requirement: student app includes AI tutor, student archive, teaching materials, personalized question bank, and scan answer.
- Whole-system map: Teaching Mode owns quiz, AI grading, archives, and worker handoff APIs.
- Whole-system map: AI Workers are Python behind a Job API and should not directly write or poll the main database.
- SDD 0038: Teaching Archive can queue metadata-only AI grading requests.

## Scope

In scope:

- Add a status/list endpoint for AI grading requests.
- Endpoint: `GET /v1/teaching/ai-grading-requests`.
- Filters: `status`, `archiveItemId`, `sourceArchiveOwnerType`, `studentId`, `pageSize`, and `cursor`.
- Apply principal scoping before repository access:
  - students see only their own student-archive AI grading requests.
  - assigned teachers see assigned student AI grading requests.
  - admins with all-student access can see all AI grading request metadata.
  - remote/social principals remain forbidden.
- Return cursor pagination and stable response fields.
- Keep metadata only; no OCR, handwriting recognition, scoring, rubric execution, model calls, worker claim, worker result, or training dependency is introduced.

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
- Use case: `ListAIGradingRequests`

PostgreSQL adapter:

- Query `teaching_ai_grading_requests` with indexed filters and cursor pagination.
- No archive file content is read by the gateway.

## Acceptance Criteria

- Domain/use-case tests prove list input normalizes filters and cursor pagination.
- Domain/use-case tests prove student principals are scoped to their own request metadata before repository access.
- Use-case tests prove assigned teacher student filters are constrained before repository access.
- Use-case tests prove remote/social principals are rejected before repository access.
- HTTP tests prove successful list returns `200` with `data` and `pageInfo`.
- HTTP tests prove student principals cannot receive another student's AI grading request when `studentId` is omitted.
- PostgreSQL adapter supports indexed filtering by status, archive item, source owner, source student, and cursor.
- Structure verification requires SDD 0039 and the new query use-case/test files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove the AI grading request list endpoint, query domain types, list use case, PostgreSQL list method/indexes, HTTP route, SDD 0039 structure checks, and tests. SDD 0038 request creation remains intact.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
