# SDD 0374: Student App AI Tutor Question-Bank Feedback Reviewed Result Persistence Bridge

## Problem

SDD 0373 proves that `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK` controlled answer
artifacts can pass a teacher or admin answer review gate. The next boundary is
internal tutoring result persistence.

Without this slice, reviewed follow-up tutoring from question-bank answer
feedback can be approved, but the system cannot prove that the approved result
is recorded through the existing guarded tutoring result use case before any
later student-visible delivery or archive workflow.

## Scope

Extend the shared Student App AI Tutor reviewed result persistence bridge so it
is source-aware for `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK` answer review gate
evidence.

This slice records:

- workload:
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_REVIEWED_RESULT_PERSISTENCE_BRIDGE`
- wrapper runtime id:
  `student_app_ai_tutor_question_bank_feedback_reviewed_result_persistence_bridge`
- shared runtime:
  `student_app_ai_tutor_reviewed_result_persistence_bridge_runtime`
- command port:
  `StudentAppAITutorResultPort.recordTutoringAnalysisResult`
- target use case:
  `RecordTutoringAnalysisResult.Execute`
- status:
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_REVIEWED_RESULT_PERSISTED`
- report:
  `reports/student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge.current.json`

The shared runtime still persists only reviewed internal tutoring result
metadata through the injected result port. It does not publish a student-visible
answer and does not create a durable student archive item.

## Non-Goals

This slice does not run actual model inference, construct prompts, publish
student-visible content, create delivery envelopes, commit student archive
storage, call OCR/RAG, use external tools, start Swarm orchestration, execute
HTTP, or access a database directly from JavaScript. It also does not replace
the published study-packet or AI Tutor result-archive persistence paths.

## Contracts

- Input consumes
  `reports/student-app-ai-tutor-question-bank-feedback-answer-review-gate.current.json`.
- Source report 0373 must be `READY`,
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_ANSWER_REVIEW_GATE`,
  zero-error, human-reviewed, and `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK`.
- The shared persistence runtime must verify the 0373 wrapper runtime, shared
  answer review gate runtime, source safety flag, and
  `READY_FOR_STUDENT_APP_READ`.
- The injected result port receives service principal metadata, request id,
  archive item id, worker id, source type, feedback status, opaque result ref,
  idempotency key, and evidence refs only.
- The injected result port must not receive guidance text, feedback submission
  id, source archive id, raw answers, answer keys, prompts, raw model output, or
  raw result refs exposed back out of the runtime.
- Output records `learningActionSource=QUESTION_BANK_DRAFT_ANSWER_FEEDBACK`
  and `feedbackStatus=READY_FOR_STUDENT_APP_READ`.
- Output keeps `studentVisiblePublished=false` and requires a later reviewed
  runtime before student visibility or durable student archive persistence.

## Acceptance Criteria

- Runtime tests prove a question-bank-feedback-sourced reviewed result can be
  persisted through `RecordTutoringAnalysisResult.Execute` without guidance text
  or feedback id leakage.
- Runtime tests reject unsafe question-bank feedback answer review gate reports.
- Audit proves source 0373 readiness, shared runtime source awareness, existing
  Go result use case reuse, runtime probe, no guidance text/id leakage to the
  result port, negative test coverage, quality gate hook, root workflow coverage
  hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.

## Performance Note

This is a control-plane persistence bridge. It validates one READY 0373 report,
calls one injected command port, and appends one JSONL evidence record. Runtime
SLO target remains P99 under 50ms.

Current whole-system performance evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`. This slice does not repeat production10k because it
does not change Docker/WSL worker count, PgBouncer configuration, connection
pools, or production runtime topology.

## Rollback

Remove SDD 0374, the question-bank feedback reviewed result persistence bridge
audit/test/report, package script, quality-gate entry, root workflow coverage
hook, structure verifier entry, root trace row, and architecture-board note.
Keep SDD 0373 intact so feedback-sourced answer review gates remain a safe
review-only boundary.
