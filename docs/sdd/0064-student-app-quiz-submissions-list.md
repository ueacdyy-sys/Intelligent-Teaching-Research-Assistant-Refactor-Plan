# SDD 0064: Student App Quiz Submissions List

## Problem

The root requirement says the Student App must expose the student's own answer
learning resources and scan-to-answer flow. SDD 0058 added a Student App scan
submission intake path, but students still need a direct mobile-friendly list of
their submitted quiz answer metadata without knowing the desktop nested teaching
archive URL shape.

This slice adds a Student App read path for the authenticated student's own quiz
submission metadata. It keeps answer bodies outside the gateway behind
`answerRef`, and it does not add OCR, RAG, model, training, or question parsing
dependencies.

## Source Requirement References

- Root requirement: Student App accesses teacher preparation resources and the
  student's own answer learning resources.
- Root requirement: Student App includes account login, AI tutor, student
  archive, teaching materials, personalized question bank, and scan-to-answer.
- SDD 0045: quiz submission intake records metadata-only answer refs.
- SDD 0046: teaching quiz submission query scopes students to their own rows.
- SDD 0058: scan-answer intake records Student App submissions through the same
  quiz submission metadata store.

## Scope

In scope:

- Add `GET /v1/student-app/quiz-submissions`.
- Require Agent API key and Principal Context.
- Require a Student App principal with own-student read access.
- Force the query to the authenticated student's own student id.
- Support optional `quizArchiveItemId`, `pageSize`, and `cursor` filters.
- Reuse `teaching_quiz_submissions` metadata and cursor pagination.
- Preserve the existing teaching nested quiz submission API.

Out of scope:

- Answer content retrieval.
- Question schema or personalized question bank persistence.
- AI grading creation from this list.
- QR image generation.
- OCR, RAG, model, scoring, or training dependencies.
- Student App UI or SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.student-app-quiz-submissions.path.yaml`

Go service:

- Domain: Student App quiz submission query gate.
- Use case: `ListStudentAppQuizSubmissions`.
- HTTP adapter: `GET /v1/student-app/quiz-submissions`.
- PostgreSQL adapter: allow quiz submission metadata queries scoped by student
  without requiring a quiz archive item filter.

## Acceptance Criteria

- Domain tests prove Student App principals are scoped to their own student id.
- Domain tests prove the list can query all own submissions without a quiz filter.
- Domain tests reject non-Student App principals and missing own-read scope.
- Use-case tests prove forbidden principals fail before repository reads.
- Use-case tests prove the repository receives only the authenticated student's
  scope and stable pagination fetch limit.
- HTTP tests prove the endpoint returns only the authenticated student's rows.
- HTTP tests prove unsupported methods return `405`.
- PostgreSQL adapter tests prove student-only queries use `student_id` without a
  fake empty `quiz_archive_item_id` predicate.
- Structure verification requires SDD 0064 and the new contract/domain/use-case/HTTP files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0064, the Student App quiz submissions OpenAPI path, the domain
gate/use-case/HTTP adapter and tests, the server wiring, and the structure
verifier entries. Keep the existing teaching quiz submission and scan submission
paths intact.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no SQL table, package, OCR/RAG/model, or training dependency was added.
