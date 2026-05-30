# SDD 0065: Student App Question Bank Drafts List

## Problem

The root requirement says the Student App must include a personalized question
bank so tutoring can end with a check of the student's level. The current
Student App AI tutor list exposes completed tutor jobs and their optional
`questionBankDraftRef`, but the mobile app still lacks a dedicated question-bank
entry point.

This slice adds a Student App read contract for personalized question-bank draft
metadata derived from successful tutoring-analysis results. It does not add a
new question-bank persistence model yet; the authoritative draft content remains
behind `questionBankDraftRef`.

## Source Requirement References

- Root requirement: Student App includes account login, AI tutor, student
  archive, teaching materials, personalized question bank, and scan-to-answer.
- Root requirement: tutoring mode adds a personalized question bank to check
  student level after tutoring.
- SDD 0035: tutoring-analysis worker result can record `questionBankDraftRef`.
- SDD 0061: Student App AI tutor requests default to personalized-check intent.
- SDD 0063: Student App can list own AI tutor requests and see result refs.

## Scope

In scope:

- Add `GET /v1/student-app/question-bank-drafts`.
- Require Agent API key and Principal Context.
- Require a Student App principal with own-student read access.
- Force the query to the authenticated student's own student id.
- Return only successful tutoring-analysis rows with `questionBankDraftRef`.
- Support `pageSize` and `cursor` query parameters.
- Return metadata needed by the mobile question-bank surface: source archive,
  result refs, draft ref, summary, and completion timestamps.

Out of scope:

- Draft content retrieval.
- Question-bank publishing, editing, answering, scoring, or versioning.
- New SQL tables, indexes, or migrations.
- AI worker execution or prompt changes.
- OCR, RAG, model, scoring, or training dependencies.
- Student App UI or SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.student-app-question-bank-drafts.path.yaml`

Go service:

- Domain: Student App question-bank draft query gate and response projection.
- Use case: `ListStudentAppQuestionBankDrafts`.
- HTTP adapter: `GET /v1/student-app/question-bank-drafts`.
- PostgreSQL adapter: reuse `teaching_tutoring_analysis_requests` and add a
  query predicate for non-null `question_bank_draft_ref`.

## Acceptance Criteria

- Domain tests prove the query is forced to own student, `SUCCEEDED`, student
  archive owner type, and non-empty question-bank draft refs.
- Domain tests reject non-Student App principals and missing own-read scope.
- Use-case tests prove forbidden principals fail before repository reads.
- Use-case tests prove returned rows are projected into question-bank draft
  metadata rather than exposing worker-only fields.
- HTTP tests prove the endpoint returns only the authenticated student's own
  completed draft refs.
- HTTP tests prove unsupported methods return `405`.
- PostgreSQL adapter tests prove `question_bank_draft_ref IS NOT NULL` is added
  with student and status predicates.
- Structure verification requires SDD 0065 and the new contract/domain/use-case/HTTP files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0065, the Student App question-bank drafts OpenAPI path, the domain
projection/use-case/HTTP adapter and tests, the tutoring query predicate, server
wiring, and structure verifier entries. Keep Student App AI tutor request list
and tutoring-analysis worker result contracts intact.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no SQL table, package, OCR/RAG/model, or training dependency was added.
