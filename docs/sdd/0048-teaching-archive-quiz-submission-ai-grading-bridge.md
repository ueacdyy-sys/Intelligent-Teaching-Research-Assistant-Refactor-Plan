# SDD 0048: Teaching Archive Quiz Submission AI Grading Bridge

## Problem

SDD 0045 and SDD 0046 added metadata-only quiz submission intake and query. SDD 0047 made AI grading worker claims carry the source archive `contentRef`. The classroom quiz flow is still not complete: a teacher or eligible student can record a submitted answer, but there is no Go-owned contract to queue an AI grading request for that specific submission, and worker claims do not expose the submitted answer reference.

The root requirement keeps classroom quiz behavior, keeps AI grading, and later asks the student app to support scan-to-answer. For the worker boundary to be useful, a quiz-submission grading job must carry both the teaching quiz artifact reference and the submitted answer artifact reference, without making Python workers poll archive or submission tables directly.

## Source Requirement References

- Root requirement: Teaching Mode includes classroom quizzes and the existing quiz function must be preserved.
- Root requirement: AI grading keeps existing functionality while reserving OCR or handwriting recognition for accurate scoring.
- Root requirement: student app later includes student answer resources and scan-to-answer.
- Whole-system map: Teaching Mode owns quiz, AI grading, archives, and worker handoff APIs.
- Whole-system map: AI Workers are Python behind a Job API and must not directly poll or write the main database.
- SDD 0045-0047: quiz submission intake/query and source archive content refs already exist.

## Scope

In scope:

- Add `POST /v1/teaching/archive-items/{archiveItemId}/quiz-submissions/{submissionId}/ai-grading-requests`.
- Require the parent archive item to be a teaching-owned `QUIZ`.
- Require the submission to belong to the parent quiz archive item.
- Allow the submitting student to queue grading for their own submission.
- Allow teacher/admin principals with assigned/all student write access to queue grading for allowed student submissions.
- Persist `sourceQuizSubmissionId` and `sourceAnswerRef` on AI grading requests.
- Include those fields in AI grading request responses and worker claim responses when present.
- Keep file content, OCR, rubric execution, model scoring, and worker implementation out of the baseline gateway.

Out of scope:

- Duplicate grading prevention.
- Quiz answer parsing.
- Grading score computation.
- OCR or handwriting recognition.
- Model calls, RAG, or training dependencies.
- Student app UI and TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.quiz-submission-ai-grading-requests.path.yaml`
- `contracts/openapi/teaching-archive.ai-grading-worker-claims.path.yaml`
- `contracts/sql/teaching-archive.sql`

Go service:

- Domain: AI grading request submission source refs and quiz-submission grading authorization.
- Use case: `CreateQuizSubmissionAIGradingRequest`.
- HTTP adapter: quiz submission AI grading request subresource.

PostgreSQL adapter:

- Add nullable `source_quiz_submission_id` and `source_answer_ref` columns to `teaching_ai_grading_requests`.
- Insert/select/scan the new metadata fields.
- Add quiz submission lookup by id for the bridge use case.

## Acceptance Criteria

- Domain tests prove quiz-submission AI grading requests normalize and retain `sourceQuizSubmissionId` and `sourceAnswerRef`.
- Domain tests reject a submission whose quiz archive item id does not match the parent archive item.
- Use-case tests fetch the parent quiz archive item and quiz submission before creating an AI grading request.
- Use-case tests prove the created request carries quiz archive content ref and submitted answer ref.
- HTTP tests prove the nested endpoint returns a `201` AI grading response with submission source fields.
- HTTP tests prove worker claims expose submission source fields when the queued request came from a quiz submission.
- PostgreSQL adapter tests prove insert/select include `source_quiz_submission_id` and `source_answer_ref`.
- Structure verification requires SDD 0048, the split OpenAPI path, bridge use case, tests, and adapter files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0048, remove the nested OpenAPI path ref, remove `sourceQuizSubmissionId` and `sourceAnswerRef` from contracts and Go response models, remove the bridge use case and HTTP route, remove PostgreSQL columns and tests, and remove structure verifier entries. Existing archive, quiz submission, direct AI grading, worker claim, and worker result behavior remains intact.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
