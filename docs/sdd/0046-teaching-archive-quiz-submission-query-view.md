# SDD 0046: Teaching Archive Quiz Submission Query View

## Problem

SDD 0045 added metadata-only classroom quiz submission intake, but the submitted answer records are not yet visible through a Go-owned read contract. The root requirement preserves classroom quiz behavior, keeps archive material as the replacement for screenshot capture, and later asks the student app to support scan-to-answer. Those flows need a stable read model so students can see their own submissions and teachers can review submissions for a teaching quiz.

This slice adds the query side for quiz submission metadata. It does not parse answers, grade submissions, generate QR codes, invoke OCR/model workers, or build UI.

## Source Requirement References

- Root requirement: Teaching Mode includes classroom quizzes and the existing quiz function must be preserved.
- Root requirement: archive materials include student learning materials and teacher teaching materials.
- Root requirement: student app later includes teaching resources, student archive, personalized question bank, and scan-to-answer.
- SDD 0029-0032: Teaching Archive stores and scopes archive material metadata.
- SDD 0045: Quiz submission intake records metadata-only student answer submissions.

## Scope

In scope:

- Add `GET /v1/teaching/archive-items/{archiveItemId}/quiz-submissions`.
- Require the target archive item to be teaching-owned `QUIZ`.
- Return metadata-only quiz submissions ordered by `submittedAt DESC, id DESC`.
- Support `studentId`, `pageSize`, and `cursor` query parameters.
- Scope student principals to their own student id.
- Scope teacher/admin principals to assigned/all student access.
- Use cursor pagination consistent with other Teaching Archive query views.

Out of scope:

- Quiz answer schema.
- Answer content retrieval.
- QR-code generation or scanning.
- AI grading request creation from submissions.
- OCR/model/RAG/training dependencies.
- Student app UI or TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.quiz-submissions.path.yaml`

Go service:

- Domain query type and authorization scope for quiz submissions.
- Use case: `ListQuizSubmissions`.
- HTTP adapter: `GET /v1/teaching/archive-items/{archiveItemId}/quiz-submissions`.

PostgreSQL adapter:

- Query `teaching_quiz_submissions` by quiz archive item, optional scoped student filters, and cursor.
- Reuse existing indexes from SDD 0045.

## Acceptance Criteria

- Domain tests prove student principals are scoped to their own submissions.
- Domain tests prove teacher/admin principals are scoped to assigned/all student access.
- Domain tests reject non-teaching or non-quiz archive items.
- Domain tests build a stable cursor page from `submittedAt` and `id`.
- Use-case tests fetch the target archive item before listing submissions.
- Use-case tests return `ErrNotFound` for a missing quiz archive item.
- HTTP tests prove a student list response excludes another student's submission.
- HTTP tests prove pagination fields are stable.
- PostgreSQL adapter tests prove query predicates include quiz id, student scope, cursor, and limit.
- Structure verification requires SDD 0046 and query-view files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0046, the `GET` operation from the quiz submissions OpenAPI path file, the list use case, domain query helpers, HTTP list handler/tests, PostgreSQL query adapter/tests, and structure verifier entries. The SDD 0045 submission intake path remains intact.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
