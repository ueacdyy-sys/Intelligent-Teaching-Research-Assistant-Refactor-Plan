# P3 Teaching Archive Quiz Submission Query View

## Scope

- Added metadata-only query view for classroom quiz submissions.
- Endpoint: `GET /v1/teaching/archive-items/{archiveItemId}/quiz-submissions`.
- Target archive item must be teaching-owned `QUIZ`.
- Student principals are scoped to their own submissions.
- Teacher/admin principals are scoped to assigned/all student access.
- Results are ordered by `submittedAt DESC, id DESC` and use cursor pagination.

Out of scope stayed out of the slice: answer parsing, answer content retrieval, QR-code generation, AI grading creation, OCR, RAG, model, training dependencies, and UI.

## Red Evidence

Before production implementation:

- `npm run verify:structure` failed because `quiz_submission_query.go`, `list_quiz_submissions.go`, and `repository_quiz_submission_query.go` were missing.
- `go test ./services/teaching-archive-gateway/...` failed with undefined domain query types, missing `NewListQuizSubmissions`, missing PostgreSQL `ListQuizSubmissions`, and the HTTP server constructor missing the list use case dependency.

## Green Evidence

- `go test ./services/teaching-archive-gateway/...` passed.
- `npm run verify:structure` passed.
- `npm test` passed.
- `npm run quality` passed.

`reports/quality-gate.current.json` records all strict gate commands passing:

- `npm test`
- `go vet`
- `cargo test`
- identity session runtime audit
- identity access contract audit
- direct-limited connection budget
- PgBouncer connection budget

## Architecture Notes

- SDD first: `docs/sdd/0046-teaching-archive-quiz-submission-query-view.md`.
- Contract first: the existing quiz submissions split OpenAPI path now owns both `GET` and `POST`.
- Clean Architecture boundary: domain owns query normalization, authorization scope, and cursor page construction; use case fetches the quiz archive item before listing; HTTP and PostgreSQL remain adapters.
- PostgreSQL query remains metadata-only and parameterized; it uses the SDD 0045 indexes for quiz/student submission lookup.
- Structure verifier now requires SDD 0046, query domain/use-case/HTTP/PostgreSQL files, tests, and SDD headings.

## Files

- `contracts/openapi/teaching-archive.quiz-submissions.path.yaml`
- `docs/sdd/0046-teaching-archive-quiz-submission-query-view.md`
- `services/teaching-archive-gateway/internal/domain/quiz_submission_query.go`
- `services/teaching-archive-gateway/internal/usecase/list_quiz_submissions.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_quiz_submission_query.go`
- `tools/verify-structure.mjs`
