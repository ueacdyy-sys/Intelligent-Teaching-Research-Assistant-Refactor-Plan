# SDD 0373: Student App AI Tutor Question-Bank Feedback Answer Review Gate

## Problem

SDD 0372 proves that `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK` can produce a
review-only controlled answer artifact. The next boundary is human review.

Without this slice, follow-up tutoring from reviewed question-bank answer
feedback can create a sanitized answer artifact, but it cannot prove that a
TEACHER or ADMIN reviewed it before later result persistence or student-visible
delivery.

## Scope

Extend the shared Student App AI Tutor answer review gate runtime so it is
source-aware for `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK` controlled answer
artifacts.

This slice records:

- workload:
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_ANSWER_REVIEW_GATE`
- wrapper runtime id:
  `student_app_ai_tutor_question_bank_feedback_answer_review_gate`
- shared runtime:
  `student_app_ai_tutor_answer_review_gate_runtime`
- command port:
  `StudentAppAITutorAnswerReviewGatePort.recordAnswerReviewGate`
- status:
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_ANSWER_REVIEW_GATE_RECORDED`
- report:
  `reports/student-app-ai-tutor-question-bank-feedback-answer-review-gate.current.json`

The shared runtime still records a human review gate only. It does not persist
a tutoring result and does not publish a student-visible answer.

## Non-Goals

This slice does not run actual model inference, construct prompts, persist a
tutoring result, publish student-visible content, call OCR/RAG, use external
tools, start Swarm orchestration, execute HTTP, or access a database directly.
It also does not replace the published study-packet or AI Tutor result-archive
answer review paths.

## Contracts

- Input consumes
  `reports/student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.current.json`.
- Source report 0372 must be `READY`,
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT`,
  zero-error, and `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK`.
- The shared answer review runtime must verify the 0372 wrapper runtime, the
  shared controlled answer artifact runtime, feedback source flags, and
  `READY_FOR_STUDENT_APP_READ`.
- The injected review gate port receives reviewer metadata, artifact ids,
  request ids, worker id, precheck id, queue ref, guidance section hash,
  decision, feedback source type, feedback status, and evidence refs only.
- The injected review gate port must not receive guidance text, feedback
  submission id, source archive id, raw answers, answer keys, prompts, or model
  output.
- Output records `learningActionSource=QUESTION_BANK_DRAFT_ANSWER_FEEDBACK`
  and `feedbackStatus=READY_FOR_STUDENT_APP_READ`.
- Output keeps `resultPersistenceStarted=false`, `tutoringResultRecorded=false`,
  and `studentVisiblePublished=false`.

## Acceptance Criteria

- Runtime tests prove a question-bank-feedback-sourced answer review gate can
  be recorded without guidance text or feedback id leakage.
- Runtime tests reject unsafe question-bank feedback controlled answer artifact
  reports.
- Audit proves source 0372 readiness, shared runtime source awareness, runtime
  probe, no guidance text/id leakage to the review gate port, negative test
  coverage, quality gate hook, root workflow coverage hook, structure verifier
  hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.

## Performance Note

This is a control-plane review boundary. It validates one READY 0372 report,
calls one injected command port, and appends one JSONL evidence record. Runtime
SLO target remains P99 under 50ms.

Current whole-system performance evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`. This slice does not repeat production10k because it
does not change Docker/WSL worker count, PgBouncer configuration, connection
pools, or production runtime topology.

## Rollback

Remove SDD 0373, the question-bank feedback answer review gate audit/test/report,
package script, quality-gate entry, root workflow coverage hook, structure
verifier entry, root trace row, and architecture-board note. Keep SDD 0372
intact so feedback-sourced controlled answer artifacts remain a safe
review-only boundary.
