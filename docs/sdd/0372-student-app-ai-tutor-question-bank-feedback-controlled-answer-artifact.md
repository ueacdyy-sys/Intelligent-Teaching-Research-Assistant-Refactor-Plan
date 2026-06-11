# SDD 0372: Student App AI Tutor Question-Bank Feedback Controlled Answer Artifact

## Problem

SDD 0371 proves that `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK` can pass the
queue-only model execution precheck without sending feedback text or feedback
ids to the model precheck port. The next product boundary is the review-only
controlled answer artifact.

Without this slice, a student can request follow-up tutoring from reviewed
question-bank answer feedback, but that path stops before the sanitized answer
artifact used by human review, persistence, and future student delivery.

## Scope

Extend the shared Student App AI Tutor controlled answer artifact runtime so it
is source-aware for `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK`.

This slice records:

- workload:
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT`
- wrapper runtime id:
  `student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact`
- shared runtime:
  `student_app_ai_tutor_controlled_answer_artifact_runtime`
- command port:
  `StudentAppAITutorControlledAnswerArtifactPort.recordControlledAnswerArtifact`
- status:
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT_RECORDED`
- report:
  `reports/student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.current.json`

The shared runtime still records a controlled answer artifact for human review.
It does not publish a student-visible tutoring result.

## Non-Goals

This slice does not run actual model inference, construct prompts, persist a
tutoring result, publish student-visible content, call OCR/RAG, use external
tools, start Swarm orchestration, execute HTTP, or access a database directly.
It also does not replace the published study-packet or AI Tutor result-archive
controlled answer artifact paths.

## Contracts

- Input consumes
  `reports/student-app-ai-tutor-question-bank-feedback-model-execution-precheck.current.json`.
- Source report 0371 must be `READY`,
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECK`,
  zero-error, and `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK`.
- The shared controlled answer runtime must verify the 0371 wrapper runtime,
  the shared model precheck runtime, feedback source flags, and
  `READY_FOR_STUDENT_APP_READ`.
- The injected command port receives request id, feedback archive item id,
  worker id, precheck id, queue ref, model route, input hash, attempt id,
  artifact policy, and evidence refs only.
- The injected command port must not receive feedback text, feedback submission
  id, source archive id, raw answers, answer keys, prompts, or model output.
- Output records `learningActionSource=QUESTION_BANK_DRAFT_ANSWER_FEEDBACK` and
  `feedbackStatus=READY_FOR_STUDENT_APP_READ`.
- Output keeps `reviewState=PENDING_HUMAN_REVIEW`.
- Output excludes prompt text, raw model output, answer keys, feedback
  submission ids, source archive ids, direct DB fields, internal errors, and
  student-visible publication fields.

## Acceptance Criteria

- Runtime tests prove a question-bank-feedback-sourced controlled answer
  artifact can be recorded for human review only.
- Runtime tests reject unsafe question-bank feedback source reports.
- Audit proves source 0371 readiness, shared runtime source awareness, runtime
  probe, no feedback text/id leakage to the artifact port, negative test
  coverage, quality gate hook, root workflow coverage hook, structure verifier
  hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.

## Performance Note

This is a control-plane artifact boundary. It validates one READY 0371 report,
calls one injected command port, and appends one JSONL evidence record. Runtime
SLO target remains P99 under 50ms.

Current whole-system performance evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`. This slice does not repeat production10k because it
does not change Docker/WSL worker count, PgBouncer configuration, connection
pools, or production runtime topology.

## Rollback

Remove SDD 0372, the question-bank feedback controlled answer artifact
audit/test/report, package script, quality-gate entry, root workflow coverage
hook, structure verifier entry, root trace row, and architecture-board note.
Keep SDD 0371 intact so feedback-sourced model execution precheck remains a
safe queue-only boundary.
