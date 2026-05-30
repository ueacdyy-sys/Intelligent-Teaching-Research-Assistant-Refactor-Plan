# P3 Teaching Archive Quiz Submission AI Grading Bridge

## Scope

- Added a metadata-only bridge from quiz submissions to AI grading requests.
- Added nested request intake at `POST /v1/teaching/archive-items/{archiveItemId}/quiz-submissions/{submissionId}/ai-grading-requests`.
- AI grading requests can now carry `sourceQuizSubmissionId` and `sourceAnswerRef`.
- Worker claim responses expose the same submitted-answer metadata for downstream grading jobs.
- PostgreSQL stores, selects, claims, and returns the submission source metadata.
- Existing direct archive-item AI grading, quiz submission intake/query, claim, and result flows remain unchanged.

Out of scope stayed out of the slice: duplicate grading prevention, answer parsing, score computation, OCR, handwriting recognition, model calls, RAG, training dependencies, worker implementation, student app UI, and TypeScript SDK generation.

## Red Evidence

Before production implementation:

- `npm run verify:structure` failed because the required bridge use case file was missing: `services/teaching-archive-gateway/internal/usecase/create_quiz_submission_ai_grading_request.go`.
- `go test ./services/teaching-archive-gateway/...` failed with missing production domain and adapter surface, including missing submission source fields, missing submission source domain helpers, missing bridge use case, missing repository lookup method, and HTTP constructor/test-helper mismatches.

## Green Evidence

- `go test ./services/teaching-archive-gateway/...` passed.
- `npm run verify:structure` passed.
- `npm test` passed.
- `npm run quality` passed after using a larger command timeout window; the first run timed out at the harness limit rather than returning a code failure.

`reports/quality-gate.current.json` records all strict gate commands passing:

- `npm test` in 69415ms.
- `go vet` in 64000ms.
- `cargo test` in 682ms.
- identity session runtime audit in 725ms.
- identity access contract audit in 701ms.
- direct-limited connection budget in 625ms.
- PgBouncer connection budget in 711ms.

## Architecture Notes

- SDD first: `docs/sdd/0048-teaching-archive-quiz-submission-ai-grading-bridge.md`.
- Contract first: OpenAPI and SQL contracts describe the nested bridge endpoint and optional submission source metadata before adapter implementation.
- Clean Architecture boundary: the use case loads the parent quiz archive and submission, then passes plain domain input inward; HTTP and PostgreSQL only translate edge representations.
- Authorization stays in the domain model: quiz-submission grading requires a teaching-owned quiz archive, matching submission parent, and either own-student access or teacher/admin student-write access.
- Domain coverage includes assigned-teacher authorization, own-student authorization, and mismatched submission rejection.
- Worker handoff remains metadata-only: Python workers receive refs instead of polling archive or submission tables directly.
- Dependency manifests were not changed, so no OCR/RAG/model/training dependency was added.

## Files

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.quiz-submission-ai-grading-requests.path.yaml`
- `contracts/openapi/teaching-archive.ai-grading-worker-claims.path.yaml`
- `contracts/sql/teaching-archive.sql`
- `docs/sdd/0048-teaching-archive-quiz-submission-ai-grading-bridge.md`
- `services/teaching-archive-gateway/internal/domain/ai_grading_request.go`
- `services/teaching-archive-gateway/internal/domain/ai_grading_submission.go`
- `services/teaching-archive-gateway/internal/usecase/create_quiz_submission_ai_grading_request.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_request.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_query.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_claim.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_result.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_quiz_submission_query.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go`
- `tools/verify-structure.mjs`
