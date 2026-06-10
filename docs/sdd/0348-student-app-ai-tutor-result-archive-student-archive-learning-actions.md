# SDD 0348: Student App AI Tutor Result Archive Student Archive Learning Actions

## Problem

SDD 0347 proves that an `AI_TUTOR_RESULT_ARCHIVE` sourced result can be read
from the Student App archive and rendered as safe `SAFE_TEXT_BLOCKS`. The next
product gap is actionability: a student must be able to continue learning from
that rendered result archive through the existing AI Tutor request queue without
the UI inventing prompts or exposing render internals.

Without this slice, the result-archive branch can render a safe card but cannot
prove the follow-up action source used by queue admission.

## Scope

Add a result-archive student-archive learning-actions evidence slice:

- wrapper runtime:
  `student_app_ai_tutor_result_archive_student_archive_learning_actions`
- shared runtime:
  `student_app_ai_tutor_result_student_archive_learning_actions_runtime`
- command port:
  `StudentAppAITutorResultStudentArchiveLearningActionsPort.readStudentVisibleArchivedResultLearningActions`
- source report:
  `reports/student-app-ai-tutor-result-archive-student-archive-render.current.json`
- report:
  `reports/student-app-ai-tutor-result-archive-student-archive-learning-actions.current.json`
- endpoint:
  `GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/learning-actions`
- Go use case:
  `ReadStudentAppAITutorResultArchiveLearningActions.Execute`

The slice reuses the existing Student App learning-actions endpoint and Go use
case. It extends the shared JS runtime so it accepts READY 0347 wrapper render
evidence as a valid source and preserves `AI_TUTOR_RESULT_ARCHIVE` plus
`READY_FOR_STUDENT_APP_READ` source metadata.

## Non-Goals

This slice must not run model inference, construct prompts, call OCR/RAG,
invoke Swarm, write archive data, publish content, create a parallel endpoint,
or expose raw render blocks. It only proves that the 0347 result-archive render
branch can safely produce action affordances for the existing Student App AI
Tutor request queue.

## Contracts

- Input consumes READY
  `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_RENDER` evidence.
- Runtime output records
  `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED`.
- Every returned action targets `POST /v1/student-app/ai-tutor-requests`.
- `learningActionSource.sourceType` is `AI_TUTOR_RESULT_ARCHIVE`.
- `learningActionSource.resultArchiveStatus` is
  `READY_FOR_STUDENT_APP_READ`.
- `learningActionSource.renderFormat` is `SAFE_TEXT_BLOCKS`.
- The Student App response omits raw render blocks, raw text, summaries,
  guidance sections, `contentRef`, raw result refs, raw model output, prompts,
  answer keys, worker IDs, internal errors, rendered HTML, and rendered
  Markdown.

## Acceptance Criteria

- JS runtime tests prove 0347 wrapper render evidence can produce safe
  learning actions through the shared injected product port.
- JS runtime tests reject unsafe 0347 source metadata before actions are read.
- HTTP tests prove
  `tarch_student_ai_tutor_result_archive_001/ai-tutor-result/learning-actions`
  returns only safe action affordances and no render/internal leaks.
- Audit verifies 0347 readiness, source-aware shared runtime support, probe
  P99 under 50ms, negative coverage, Go HTTP/OpenAPI reuse, package script,
  quality-gate hook, root workflow hook, structure verifier hook, root trace,
  SDD, and architecture board progress.

## Performance Note

This is a control-plane/product-action boundary. It validates one READY 0347
render report, calls one injected learning-actions port, maps safe action
affordances, and writes one report. Runtime SLO target remains under 50ms. The
whole-system production10k evidence remains `22,435.1 read/write RPS`, `P99
44.44ms`, `0 errors`; this slice does not repeat large-scale pressure testing.

## Rollback

Remove SDD 0348, the wrapper audit/test files, package script, quality-gate
entry, root workflow coverage hook, structure verifier entry, root trace row,
architecture-board note, and the 0347-specific shared-runtime/test additions.
Keep SDD 0335 and 0347 intact because the original learning-actions boundary
and result-archive safe render boundary remain valid independently.
