# SDD 0045: Teaching Archive Quiz Submission Intake

## Problem

The root requirement keeps classroom quiz behavior in Teaching Mode and later asks the student app to support scan-to-answer flows. The refactor already has archive material intake plus tutoring and AI grading worker handoffs, but there is still no Go-owned contract for the first classroom quiz write path: recording that a student submitted answers for a teaching quiz.

This slice adds a metadata-only quiz submission boundary. It does not design the quiz UI, parse answers, grade responses, generate QR codes, or invoke OCR/model workers. It creates the durable submission record that later UI, grading, archive export, and student-app scan flows can build on.

## Source Requirement References

- Root requirement: Teaching Mode includes classroom quizzes and the existing quiz function must be preserved.
- Root requirement: student app later includes teaching resources, student answer resources, and scan-to-answer.
- Root requirement: archive materials include student learning materials and teacher teaching materials.
- Whole-system map: Teaching Mode owns quiz, AI grading, archives, and worker handoff APIs.
- SDD 0029: Teaching Archive stores teaching and student archive material metadata.
- SDD 0038-0044: AI grading and worker result flow remain separate from quiz submission intake.

## Scope

In scope:

- Add a quiz submission endpoint for one student answer artifact.
- Endpoint: `POST /v1/teaching/archive-items/{archiveItemId}/quiz-submissions`.
- Require the target archive item to be a teaching-owned `QUIZ`.
- Allow a student principal to submit only for that student's own student id.
- Allow a teacher/admin with assigned/all student archive write access to submit for an allowed student id.
- Store `answerRef`, `studentId`, `submittedByPrincipalId`, `status`, and `submittedAt`.
- Keep answer parsing, grading, OCR, QR-code generation, AI scoring, and UI flows out of this slice.

Out of scope:

- Quiz authoring.
- Quiz question/answer schema.
- QR-code generation or scanning.
- AI grading request creation from a submission.
- Student app UI.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.quiz-submissions.path.yaml`
- `contracts/sql/teaching-archive.sql`

Go service:

- `services/teaching-archive-gateway`
- Use case: `CreateQuizSubmission`

PostgreSQL adapter:

- Add `teaching_quiz_submissions` for metadata-only submitted answers.
- Index quiz/student submission lookups for later list/query slices.

## Acceptance Criteria

- Domain tests prove student submissions normalize the student id and answer reference.
- Domain tests prove teacher/admin submissions require assigned/all student write access.
- Domain tests reject non-teaching or non-quiz archive items.
- Use-case tests fetch the target archive item before creating a submission.
- Use-case tests prove students cannot submit for another student.
- HTTP tests prove quiz submission returns stable `201` response fields.
- HTTP tests prove forbidden principals cannot create submissions.
- PostgreSQL adapter inserts only submission metadata and does not read answer content.
- Structure verification requires SDD 0045, OpenAPI path, domain/use-case/HTTP/PostgreSQL files and tests.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0045, the quiz submission endpoint, submission domain/use-case/PostgreSQL files, SQL table/indexes, OpenAPI path ref file, tests, and structure verifier entries. Archive intake, tutoring analysis, and AI grading request/worker flows remain intact.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
