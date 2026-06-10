# SDD 0335: Student App AI Tutor Result Student Archive Learning Actions

## Problem

SDD 0334 proves the Student App can render an archived AI Tutor result as a
safe `SAFE_TEXT_BLOCKS` envelope. The product still needs an audited action
boundary so a student can continue learning from that archived result without
the UI inventing prompts, exposing render blocks, or bypassing the existing AI
Tutor request queue.

Without this slice, archived AI Tutor results are readable but not actionable.
The Student App would have no safe, contract-backed way to turn a reviewed
result archive into a follow-up AI Tutor request or personalized question-bank
intent.

## Scope

Add a result-archive learning-action evidence slice:

- runtime:
  `verifyStudentAppAITutorResultStudentArchiveLearningActions`
- command port:
  `StudentAppAITutorResultStudentArchiveLearningActionsPort.readStudentVisibleArchivedResultLearningActions`
- report:
  `reports/student-app-ai-tutor-result-student-archive-learning-actions.current.json`
- endpoint:
  `GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/learning-actions`
- Go use case:
  `ReadStudentAppAITutorResultArchiveLearningActions.Execute`
- queue source:
  `learningActionSource.sourceType = AI_TUTOR_RESULT_ARCHIVE`

The runtime and Go path must:

- require a READY 0334 safe render-envelope report
- use the authenticated own-student principal
- rebuild the safe archived result-card/render/actions boundary through
  injected ports and Go use cases
- return only action affordances that target
  `POST /v1/student-app/ai-tutor-requests`
- include a safe `learningActionSource` so queue admission can verify the
  archive result source
- record
  `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED`
- keep raw render blocks, `contentRef`, raw `resultRef`, prompts, answer keys,
  raw model output, worker internals, HTTP/SQL/model/OCR/RAG/Swarm details, and
  internal errors out of the Student App response

## Non-Goals

This slice must not run model inference, construct prompts, call OCR/RAG,
perform Swarm orchestration, write archive data, publish new content, expose raw
render blocks, or complete the whole AI Tutor product. It only proves that a
previously reviewed, committed, verified, read, and rendered result archive can
admit a follow-up Student App AI Tutor queue request safely.

## Contracts

- Input consumes
  `reports/student-app-ai-tutor-result-student-archive-render.current.json`.
- Runtime output records
  `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED`.
- HTTP path is
  `GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/learning-actions`.
- Every returned action targets `POST /v1/student-app/ai-tutor-requests`.
- `learningActionSource.sourceType` is `AI_TUTOR_RESULT_ARCHIVE`.
- `learningActionSource.resultArchiveStatus` is `READY_FOR_STUDENT_APP_READ`.
- `learningActionSource.renderFormat` is `SAFE_TEXT_BLOCKS`.
- Queue admission through `POST /v1/student-app/ai-tutor-requests` must rebuild
  the safe archive card, render envelope, and learning actions before creating
  the tutor request.
- Go and OpenAPI responses omit raw render blocks, raw text, summaries,
  guidance sections, `contentRef`, raw result refs, raw model output, prompts,
  answer keys, worker IDs, internal errors, rendered HTML, and rendered
  Markdown.
- Verified archive item is `tarch_student_ai_tutor_result_001`.

## Acceptance Criteria

- Runtime tests prove positive safe learning actions, idempotent replay,
  conflicting replay rejection, missing port rejection, cross-student
  rejection, mismatched action-source rejection, unsafe policy rejection,
  leaked render content rejection, wrong target rejection, and missing evidence
  rejection.
- Go domain tests prove the builder returns safe action sources and rejects
  unsafe archive/render state.
- Go use-case tests prove the learning-actions reader consumes the safe render
  path and propagates boundary errors before returning actions.
- HTTP tests prove the endpoint returns only safe action affordances and rejects
  cross-student, teacher, and wrong method access.
- Queue-admission tests prove `AI_TUTOR_RESULT_ARCHIVE` sources are verified by
  rebuilding the safe archived result boundary and that unsafe sources are
  rejected before request creation.
- Audit verifies 0334 readiness, runtime identity, injected product port, no raw
  DB/SQL/HTTP/model/tool/Swarm access, no raw render disclosure, runtime probe
  under 50ms, negative test coverage, Go domain/usecase/HTTP and OpenAPI path,
  package script, quality gate hook, root workflow coverage hook, structure
  verifier hook, root trace row, and architecture board update.

## Performance Note

This is a control-plane/product-action boundary. It validates one READY 0334
render report, calls one injected learning-actions port, maps safe action
affordances, and appends one JSONL evidence record. Runtime SLO target remains
under 50ms. The whole-system production10k evidence remains `22,435.1
read/write RPS`, `P99 44.44ms`, `0 errors`; this slice does not repeat
large-scale performance testing.

## Rollback

Remove the runtime/audit/test files, SDD 0335, report file, package script,
quality-gate entry, root workflow coverage hook, structure verifier entry, root
trace row, Go domain/usecase/HTTP/OpenAPI additions, queue-admission source
extension, and architecture-board note. Keep SDD 0320-0334 intact because the
published learning actions and Student App AI Tutor archived-result read/render
chain remains valid.
