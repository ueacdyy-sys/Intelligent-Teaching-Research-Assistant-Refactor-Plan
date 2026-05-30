# SDD 0066: Student App Quiz Scan Submission

## Problem

The root requirement says the Student App must include scan-to-answer. SDD 0058
added the metadata-only scan submission path, but it exposed that mobile flow
under `/v1/teaching/quiz-scan-submissions`. The Student App now has a dedicated
namespace for teaching materials, archive items, AI tutor requests, submitted
quiz answers, and personalized question-bank drafts. Scan-to-answer should use
that same mobile-facing namespace so clients do not depend on a teaching-mode
URL shape.

This slice adds a Student App route for scan-answer intake while reusing the
existing SDD 0058 domain and use-case behavior. It does not add answer storage,
question parsing, OCR, RAG, model, scoring, or training dependencies.

## Source Requirement References

- Root requirement: Student App includes account login, AI tutor, student
  archive, teaching materials, personalized question bank, and scan-to-answer.
- SDD 0058: scan-answer intake resolves `teaching-quiz:{archiveItemId}` and
  records metadata-only quiz submissions for the authenticated student.
- SDD 0064: Student App can list the authenticated student's own quiz
  submissions after scan answer.

## Scope

In scope:

- Add `POST /v1/student-app/quiz-scan-submissions`.
- Require Agent API key and Principal Context.
- Preserve the existing SDD 0058 Student App principal gate:
  `STUDENT_OWN_WRITE`, own-student access, and Student App entry point.
- Accept the same bounded payload: `scanCode` and `answerRef`.
- Reuse `CreateScannedQuizSubmission` so the submitted `studentId` comes from
  Principal Context, not from client JSON.
- Return the existing quiz submission metadata response.

Out of scope:

- Changing or removing `POST /v1/teaching/quiz-scan-submissions`.
- QR image generation or signed QR tokens.
- Answer body parsing or storage.
- Duplicate submission prevention.
- AI grading creation.
- OCR, RAG, model, scoring, or training dependencies.
- Student App UI or SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.student-app-quiz-scan-submissions.path.yaml`

Go service:

- HTTP adapter: `POST /v1/student-app/quiz-scan-submissions`.
- Domain/use case: reuse SDD 0058 `CreateScannedQuizSubmission`.
- PostgreSQL adapter: no new persistence method; reuse quiz submission metadata
  insert.

## Acceptance Criteria

- OpenAPI exposes the Student App scan-answer path under `/v1/student-app`.
- Structure verification requires SDD 0066, the Student App OpenAPI path, and
  the Student App HTTP adapter/test files.
- HTTP tests prove the Student App route returns the stable quiz submission
  `201` response for a Student App principal.
- HTTP tests prove unsupported methods return `405`.
- The implementation does not add SQL tables, package dependencies, OCR/RAG,
  model, scoring, or training dependencies.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0066, the Student App scan-answer OpenAPI path and reference, the
Student App HTTP adapter and tests, and the structure verifier entries. Keep the
existing SDD 0058 teaching-path scan submission route intact.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json`
  summary.
- confirmation that no SQL table, package, OCR/RAG/model, scoring, or training
  dependency was added.
