# SDD 0275 - Student App AI Tutor Question-Bank Draft Answer Feedback Archive Persistence Command

## Problem

SDD 0274 creates a Student App renderable feedback delivery envelope, but it
intentionally stops before durable student archive persistence. The next root
workflow gap is not the final database commit yet. The system first needs an
auditable archive persistence command that preserves the approved learner
feedback, own-student scope, and delivery evidence while keeping the durable
commit behind a later reviewed slice.

The immutable root requirements require a Student App AI tutor, personalized
question bank flow, student archive access, teaching material access, and
scan-to-answer learning loop. This slice advances the feedback loop from
student-visible delivery toward student archive persistence without collapsing
review, safety, and durable-write boundaries into one step.

## Scope

Add an auditable feedback archive persistence command runtime for the Student
App question-bank answer feedback chain.

The runtime consumes:

- the READY 0274 feedback delivery envelope report;
- the safe Student App feedback envelope;
- a controlled Student archive persistence service principal;
- a persistence request that matches the delivery envelope and preserves
  own-student scope;
- a policy that permits only append-only command evidence.

The runtime records
`STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED`.

This slice intentionally does not write a database row, commit to the student
archive, expose an HTTP endpoint, call a model, remote-control devices, mutate
local tools, or enable Swarm.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-audit.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.current.json`
- Source evidence:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope.current.json`

## Acceptance Criteria

- The runtime requires a controlled SERVICE principal with
  `TEACHING_READ`, `STUDENT_ARCHIVE_WRITE`, and `STUDENT_APP_DELIVERY` scopes.
- The runtime requires READY 0274 delivery envelope evidence.
- The delivery envelope must remain
  `STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED`.
- The persistence request must match deliveryEnvelopeRecordId,
  deliveryEnvelopeId, approvedFeedbackArtifactId, submissionId, requestId,
  questionBankDraftRef, tutoringAnalysisRequestId, archiveItemId, and scopeRef
  from the 0274 evidence.
- The runtime records a
  `STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND` with commit state
  `NOT_COMMITTED_TO_STUDENT_ARCHIVE`.
- The runtime is idempotent by idempotency key and rejects conflicting replay.
- The runtime preserves scoreSummary and safe learnerFeedback while rejecting
  answer text, answer keys, expected answers, explanations, result refs,
  worker/claim fields, raw model output, durable commit result fields,
  internal error messages, and unsafe HTML-like text.
- The audit proves package scripts, strict quality, root workflow coverage,
  structure verification, SDD, and architecture board track 0275.

## Performance

This is a control-plane archive persistence command step and does not change
the production durable write hot path. It is held to the Student App
control-plane target of P99 <= 50ms. Current whole-system evidence remains
`22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; no new `production10k`
run is required for this slice because no hot-path or runtime worker
configuration changed.

## Rollback

Remove the 0275 runtime, runtime tests, audit, report, package script, strict
quality hook, root workflow coverage hook, structure verifier entries, SDD,
and architecture-board 10.15 text. Keep 0260-0274 intact because Student App AI
Tutor request, worker claim, result, question-bank draft visibility, content
precheck/read, answer submission, scoring request/input/result, completion
bridge, publication precheck, reviewed feedback artifact, publication
approval, and delivery envelope remain valid independent slices.
