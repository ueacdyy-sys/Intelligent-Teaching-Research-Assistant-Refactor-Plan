# SDD 0034: Teaching Archive Tutoring Analysis Query View

## Problem

SDD 0033 lets an authorized principal queue a metadata-only tutoring analysis request for an archive item. The root requirement also needs student archives, teaching materials, personalized tutoring, and later personalized question-bank checks to become visible in teacher/student workflows.

Without a query/status view, the UI, student app, and later worker boundary cannot safely show queued request state. A list view is needed before any OCR, RAG, or model worker is attached.

## Source Requirement References

- Root requirement: archive material can be transferred to tutoring mode for analysis.
- Root requirement: student archives and teaching materials are used by personalized tutoring assistants.
- Root requirement: tutoring mode should add a personalized question bank to detect student level after tutoring.
- Root requirement: student app includes AI tutor, student archive, teaching materials, personalized question bank, and scan answer.
- SDD 0031: Teaching Archive requires principal authorization.
- SDD 0032: student archive queries are scoped before repository access.
- SDD 0033: Teaching Archive can queue metadata-only tutoring analysis requests.

## Scope

In scope:

- Add a status/list endpoint for tutoring analysis requests.
- Endpoint: `GET /v1/teaching/tutoring-analysis-requests`.
- Filters: `status`, `archiveItemId`, `sourceArchiveOwnerType`, `studentId`, `pageSize`, and `cursor`.
- Apply principal scoping before repository access:
  - students see only their own student-archive tutoring requests.
  - assigned teachers see assigned student requests and teaching-material requests allowed by teaching read scope.
  - admins with all-student access can see all scoped request metadata.
  - remote/social principals remain forbidden.
- Return cursor pagination and stable response fields.
- Keep metadata only; no worker execution, OCR, RAG, model, or training dependency is introduced.

Out of scope:

- Running tutoring analysis.
- Updating request status.
- Worker polling or queue claiming.
- Generating personalized questions.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/sql/teaching-archive.sql`

Go service:

- `services/teaching-archive-gateway`
- Use case: `ListTutoringAnalysisRequests`

## Acceptance Criteria

- Domain tests prove list input normalizes filters and cursor pagination.
- Domain/use-case tests prove student principals are scoped to their own request metadata before repository access.
- Use-case tests prove assigned teacher student filters are constrained before repository access.
- Use-case tests prove remote/social principals are rejected before repository access.
- HTTP tests prove successful list returns `200` with `data` and `pageInfo`.
- HTTP tests prove student principals cannot receive another student's tutoring request when `studentId` is omitted.
- PostgreSQL adapter supports indexed filtering by status, archive item, source owner, source student, requested principal, and cursor.
- Structure verification requires SDD 0034 and the new query use-case/test files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove the tutoring analysis request list endpoint, query domain types, list use case, PostgreSQL list method/indexes, HTTP route, SDD 0034 structure checks, and tests. SDD 0033 request creation remains intact.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
