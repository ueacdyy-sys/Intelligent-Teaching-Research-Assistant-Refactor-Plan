# P3 Teaching Archive AI Grading Query View

## Slice

- SDD: `docs/sdd/0039-teaching-archive-ai-grading-query-view.md`
- Endpoint: `GET /v1/teaching/ai-grading-requests`
- Scope: metadata-only AI grading request status list for teacher/student UI.

## Requirement Trace

- Root requirement: AI grading remains in Teaching Mode, with OCR or handwriting recognition reserved for later precise scoring.
- Root requirement: archive materials and student archive data feed later AI tutoring and analysis workflows.
- Whole-system map: AI Workers stay behind a Job API and do not directly poll/write the main database.
- SDD 0038: AI grading request intake queues metadata-only `QUEUED` jobs.

## Red Evidence

Before implementation, `go test ./services/teaching-archive-gateway/...` failed as expected:

- `undefined: usecase.NewListAIGradingRequests`
- `undefined: domain.ListAIGradingRequestsInput`
- `repository.ListAIGradingRequests undefined`
- `undefined: domain.AIGradingRequestQuery`

## Implementation

- Added `AIGradingRequestQuery`, cursor pagination, page builder, and principal scoping in the domain layer.
- Added `ListAIGradingRequests` use case with repository reader port.
- Added HTTP route and response mapping for `/v1/teaching/ai-grading-requests`.
- Added PostgreSQL list query in a separate adapter file to keep `repository.go` below the 800-line quality threshold.
- Split the AI grading list OpenAPI path into `contracts/openapi/teaching-archive.ai-grading-requests.path.yaml` so `teaching-archive.yaml` remains below the strict file-size threshold.
- Added indexed SQL support for archive-item, source-owner, source-student, status, and cursor pagination paths.

## Verification

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS
- `npm run quality`: PASS

## Performance And Dependency Notes

- Query uses bounded `pageSize` with cursor pagination.
- PostgreSQL filters use parameterized SQL and indexed columns.
- No OCR, RAG, model, training, or worker dependency was added.
- Largest touched source files remain under 800 lines after the split:
  - `server.go`: 732 lines
  - `server_test.go`: 797 lines
  - `repository.go`: 761 lines

## Rollback

Remove SDD 0039, the AI grading list route, query domain/use-case files, Postgres list file/indexes, OpenAPI path ref file, tests, and structure verifier entries. SDD 0038 AI grading intake can remain.
