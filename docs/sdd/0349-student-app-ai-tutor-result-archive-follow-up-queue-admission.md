# SDD 0349: Student App AI Tutor Result Archive Follow-up Queue Admission

## Problem

SDD 0348 proves that a student-visible `AI_TUTOR_RESULT_ARCHIVE` can expose
safe learning actions. The next boundary is queue admission: clicking that
action must reuse the existing `POST /v1/student-app/ai-tutor-requests`
contract and must prove the result-archive source again before creating a
tutoring request.

## Scope

This slice consumes READY SDD 0348
`STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED`
evidence and verifies follow-up AI Tutor request admission through the existing
Student App AI Tutor request endpoint.

- Workload type:
  `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_QUEUE_ADMISSION`
- Runtime evidence id:
  `student_app_ai_tutor_result_archive_follow_up_queue_admission`
- Report:
  `reports/student-app-ai-tutor-result-archive-follow-up-queue-admission.current.json`
- Ready status:
  `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_QUEUE_ADMISSION_VERIFIED`

## Contracts

1. Require READY 0348 result-archive learning-actions evidence.
2. Require the selected action target to be
   `POST /v1/student-app/ai-tutor-requests`.
3. Accept only `learningActionSource.sourceType = AI_TUTOR_RESULT_ARCHIVE`.
4. Rebuild the archive item, safe result archive card, `SAFE_TEXT_BLOCKS`
   render envelope, and learning actions in
   `CreateStudentAppAITutorRequest.Execute` before queue creation.
5. Match action type, question-bank intent, target endpoint, HTTP method,
   result archive status, render format, and source type.
6. Create only a normal queued tutoring analysis request.
7. Persist only the source type needed by the worker path.

## Safety Invariants

- No new public endpoint is introduced.
- The queue response does not expose `learningActionSource`, raw render blocks,
  `contentRef`, raw result refs, raw model output, prompt, answer key,
  `renderedHtml`, `renderedMarkdown`, worker internals, or storage internals.
- JavaScript evidence does not directly access DB, execute SQL/HTTP, call a
  model, start OCR/RAG, invoke tools, or start Swarm.
- The Go use case owns queue admission; JS only audits the boundary.
- Result-archive follow-up cannot masquerade as a published study-packet action.

## Acceptance Criteria

- `node tools/student-app-ai-tutor-result-archive-follow-up-queue-admission-audit.mjs`
  returns READY.
- Go domain/usecase/httpapi tests cover the result-archive source positive path
  and unsafe source rejection.
- OpenAPI keeps the single `POST /v1/student-app/ai-tutor-requests` admission
  contract with the `AI_TUTOR_RESULT_ARCHIVE` learning-action-source branch.
- Root workflow, structure verifier, strict quality gate, root trace, and
  architecture board all track 0349.

## Rollback

Remove this SDD, the 0349 audit/test/report, and the 0349 hook entries from
package scripts, quality gate, root workflow coverage, structure verification,
root trace, and architecture board. The underlying Go queue behavior remains
covered by its own usecase and HTTP tests.
