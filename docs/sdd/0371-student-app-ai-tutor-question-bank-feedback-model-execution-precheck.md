# SDD 0371: Student App AI Tutor Question-Bank Feedback Model Execution Precheck

## Problem

SDD 0370 proves that reviewed question-bank draft answer feedback can expose safe
learning actions and can rebuild worker-safe `SAFE_TEXT_BLOCKS` from persisted
feedback evidence. The shared AI Tutor model execution precheck was still proven
only for published study packets and result archives.

Without this slice, a `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK` follow-up can enter
the queue and worker input boundary, but cannot safely pass the queue-only model
execution admission gate. That leaves the feedback-to-AI-Tutor loop stalled
before any controlled answer artifact can be reviewed.

## Scope

Extend the shared Student App AI Tutor model execution precheck runtime so it is
source-aware for `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK`.

This slice records:

- workload:
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECK`
- runtime id:
  `student_app_ai_tutor_question_bank_feedback_model_execution_precheck`
- shared runtime:
  `student_app_ai_tutor_model_execution_precheck_runtime`
- command port:
  `StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck`
- status:
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECKED`
- report:
  `reports/student-app-ai-tutor-question-bank-feedback-model-execution-precheck.current.json`

The runtime still only admits a future model-execution queue entry. It does not
construct prompts and does not call a model.

## Non-Goals

This slice does not execute model inference, build prompts, generate AI Tutor
answer text, create a controlled answer artifact, persist tutoring results,
publish student-visible content, call OCR/RAG, use external tools, start Swarm
orchestration, execute HTTP, or access a database directly.

## Contracts

- Source must be the 0370 feedback worker branch: feedback snapshot, safe render,
  and learning actions are rebuilt server-side from persisted feedback evidence.
- `workerInput.learningActionSource` must be
  `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK`.
- `workerInput.feedbackStatus` must be `READY_FOR_STUDENT_APP_READ`.
- `workerInput.feedbackSubmissionId` and `feedbackSourceArchiveItemId` must be
  normalized worker metadata and must not be sent to the command port.
- `packetStatus` and `resultArchiveStatus` must be absent for feedback sources.
- `renderFormat` must be `SAFE_TEXT_BLOCKS`.
- Feedback blocks may only use `SUMMARY` and `GUIDANCE_SECTION`.
- The runtime hashes safe feedback blocks into the input hash.
- The injected command port receives only source type, render format, block
  count, block digests, input hash, approval, and evidence refs.
- The injected command port must not receive feedback text, submission ids,
  source archive ids, raw answers, answer keys, prompts, or model output.

## Acceptance Criteria

- Shared runtime tests prove feedback-sourced model precheck records queue-only
  admission without sending feedback text or ids to the port.
- Shared runtime tests reject mismatched source evidence and leaked fields.
- Audit proves 0370 worker feedback rebuilding exists, the shared runtime
  accepts `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK`, the port sees no feedback text
  or ids, and P99 remains below 50ms.
- Package scripts and strict quality gate include the 0371 audit.
- Root workflow coverage tracks 0371 in Teaching and Student App personalized
  learning workflows.
- Structure verification requires the SDD, audit, test, and runtime evidence id.
- Root trace and architecture board describe the 0371 boundary and non-goals.

## Performance Note

This is a control-plane precheck boundary. It validates the feedback-source
worker context, hashes two safe text blocks in the probe, calls one injected
command port, and appends one JSONL evidence record. Runtime SLO target remains
P99 under 50ms.

Current whole-system performance evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`. This slice does not repeat production10k because it
does not change Docker/WSL worker count, PgBouncer configuration, connection
pools, or production runtime topology.

## Rollback

Remove SDD 0371, the feedback model execution precheck audit/test/report, the
`QUESTION_BANK_DRAFT_ANSWER_FEEDBACK` branch in the shared model precheck
runtime and tests, package script, quality-gate entry, root workflow coverage
hook, structure verifier entry, root trace row, and architecture-board note.
Keep SDD 0370 intact so feedback learning actions and worker input remain safe.
