# P3 Teaching Archive Quiz Submission Intake

## Scope

- Added metadata-only classroom quiz submission intake for Teaching Mode.
- Endpoint: `POST /v1/teaching/archive-items/{archiveItemId}/quiz-submissions`.
- Target archive item must be teaching-owned `QUIZ`.
- Student principals can submit only for their own student id; teacher/admin principals need assigned/all student archive write access.
- Stored submission metadata only: `answerRef`, `studentId`, `submittedByPrincipalId`, `status`, and `submittedAt`.

Out of scope stayed out of the slice: quiz UI, QR-code generation, answer parsing, AI grading, OCR, RAG, model, and training dependencies.

## Red Evidence

Before production wiring, targeted Go tests failed with missing quiz submission domain/use-case/PostgreSQL/HTTP symbols and the structure verifier rejected the missing slice files.

After initial production wiring, the HTTP adapter still failed to build because existing `NewServer` test composition roots did not pass the new `CreateQuizSubmission` dependency. That confirmed the constructor change had not been propagated across all existing Teaching Archive test servers.

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

- SDD first: `docs/sdd/0045-teaching-archive-quiz-submission-intake.md`.
- Contract first: split OpenAPI path file keeps `teaching-archive.yaml` under the size headroom.
- Clean Architecture boundary: domain owns validation and authorization rules; use case orchestrates archive lookup plus create; HTTP and PostgreSQL stay as adapters.
- PostgreSQL writes only metadata to `teaching_quiz_submissions`; answer content remains behind `answerRef`.
- Structure verifier now requires the 0045 SDD, OpenAPI path, domain/use-case/HTTP/PostgreSQL files, tests, and SDD headings.

## Files

- `contracts/openapi/teaching-archive.quiz-submissions.path.yaml`
- `contracts/sql/teaching-archive.sql`
- `services/teaching-archive-gateway/internal/domain/quiz_submission.go`
- `services/teaching-archive-gateway/internal/usecase/create_quiz_submission.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_quiz_submission.go`
- `tools/verify-structure.mjs`
