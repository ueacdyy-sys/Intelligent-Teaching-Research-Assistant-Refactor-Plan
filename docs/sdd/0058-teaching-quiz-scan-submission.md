# SDD 0058: Teaching Quiz Scan Submission

## Problem

The root requirement names the Student App as a later surface with account login, AI tutor, student archive, teaching materials, personalized question bank, and scan-to-answer. SDD 0045 through SDD 0048 already added metadata-only quiz submission intake, query, and AI-grading handoff, but the student mobile path still has to know the nested desktop API shape and quiz archive item id directly.

This slice adds a Student App scan-answer intake path. The QR payload is not a security boundary; it is a bounded locator for a teaching quiz archive item. Security remains Principal Context plus existing quiz submission authorization. The slice keeps answer content behind `answerRef` and does not generate QR images, parse answer bodies, or invoke model/OCR workers.

## Source Requirement References

- Root requirement: Student App includes account login, AI tutor, student archive, teaching materials, personalized question bank, and scan-to-answer.
- Root requirement: Teaching Mode classroom quiz behavior remains functionally preserved while UI can be rebuilt.
- SDD 0045: quiz submission intake records metadata-only answer refs.
- SDD 0046: quiz submission query view scopes students to their own submissions.
- SDD 0048: quiz submission-to-AI grading bridge carries submitted answer refs to workers.

## Scope

In scope:

- Add `POST /v1/teaching/quiz-scan-submissions`.
- Require a valid Agent API key and Principal Context.
- Require a Student App principal with own-student write access.
- Accept a bounded QR payload string, `scanCode`, using `teaching-quiz:{archiveItemId}`.
- Resolve the scan payload into an existing teaching quiz archive item.
- Record a quiz submission for the authenticated student's own student id.
- Store only the same metadata as SDD 0045: `answerRef`, `studentId`, `submittedByPrincipalId`, `status`, and `submittedAt`.

Out of scope:

- QR image generation.
- Signed/expiring QR tokens.
- Quiz authoring or question schema.
- Answer body parsing or storage.
- Duplicate submission prevention.
- AI grading creation.
- OCR, RAG, model, scoring, or training dependencies.
- Student App UI or TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.quiz-scan-submissions.path.yaml`

Go service:

- Domain: scan-code normalization and Student App principal gate.
- Use case: `CreateScannedQuizSubmission`.
- HTTP adapter: `POST /v1/teaching/quiz-scan-submissions`.
- PostgreSQL adapter: no new persistence method; reuse existing quiz submission metadata insert.

## Acceptance Criteria

- Domain tests prove scan codes normalize `teaching-quiz:{archiveItemId}` into an archive item id.
- Domain tests reject unknown scan-code schemes and missing archive item ids.
- Domain tests prove only Student App own-student principals can use the scan submission path.
- Use-case tests prove scan submission fetches the resolved quiz archive item before creating a submission.
- Use-case tests prove unauthorized principals fail before repository access.
- Use-case tests return `ErrNotFound` for missing quiz archive items.
- Use-case tests reject non-quiz archive items.
- HTTP tests prove the Student App endpoint returns the stable quiz submission `201` response.
- HTTP tests prove unsupported methods return `405`.
- Structure verification requires SDD 0058 and the new contract/domain/use-case/HTTP files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0058, remove the OpenAPI path reference and path file, remove scan-submission domain/use-case/HTTP files and tests, remove server wiring and structure verifier entries. SDD 0045 through SDD 0048 quiz submission and grading paths remain intact.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
