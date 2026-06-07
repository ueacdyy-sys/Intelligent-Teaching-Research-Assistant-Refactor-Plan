# SDD 0299 - Student App AI Tutor Question-Bank Draft Answer Feedback Archive Persistence Command Controlled Draft Source

## Problem

SDD 0298 creates a Student App renderable feedback envelope from the controlled
draft source chain, but it intentionally stops before durable student archive
persistence. The next product gap is an auditable archive persistence command
that consumes the 0298 controlled-source envelope instead of the legacy 0274
delivery envelope.

The immutable root requirements require the Student App AI tutor loop to help
students, retain evidence, and support student archive access. This must not
collapse review, student-visible delivery, append-only command recording, and
durable storage commit into one unsafe step. This slice therefore records only
a controlled append-only command and keeps the actual database write behind a
later reviewed storage commit.

## Scope

Add an auditable Student App feedback archive persistence command runtime that
consumes the READY 0298 controlled-draft-source delivery envelope report.

The runtime consumes:

- the READY 0298 delivery envelope controlled draft source report;
- the safe Student App feedback envelope and its preserved source controlled
  draft evidence;
- a controlled `STUDENT_ARCHIVE_PERSISTENCE_RUNTIME` service principal;
- a persistence request that matches deliveryEnvelopeRecordId,
  deliveryEnvelopeId, approvalRecordId, approvalId,
  sourceControlledDraftArtifactId, approvedFeedbackArtifactId, submissionId,
  requestId, questionBankDraftRef, tutoringAnalysisRequestId, archiveItemId,
  and student scope;
- a policy that permits only append-only command evidence.

The runtime records
`STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED`
with desired archive state
`PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED`.

This slice intentionally does not write a database row, commit to the student
archive, expose an HTTP endpoint, call a model, remote-control devices, mutate
local tools, or enable Swarm.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.current.json`
- Source evidence:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.current.json`

## Acceptance Criteria

- The runtime requires READY 0298 source delivery evidence.
- The runtime requires a SERVICE principal entering through
  `STUDENT_ARCHIVE_PERSISTENCE_RUNTIME` with `TEACHING_READ`,
  `STUDENT_ARCHIVE_WRITE`, and `STUDENT_APP_DELIVERY`.
- The 0298 delivery envelope must remain
  `STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED`.
- The persistence request must match deliveryEnvelopeRecordId,
  deliveryEnvelopeId, approvalRecordId, approvalId,
  sourceControlledDraftArtifactId, approvedFeedbackArtifactId, submissionId,
  requestId, questionBankDraftRef, tutoringAnalysisRequestId, archiveItemId,
  and scopeRef from the 0298 evidence.
- The runtime records a
  `STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE`
  with commit state `NOT_COMMITTED_TO_STUDENT_ARCHIVE`.
- The runtime preserves sourcePublicationApproval,
  sourceControlledFeedbackDraft, studentFeedbackDeliveryEnvelope source
  controlled draft evidence, scoreSummary, and safe learnerFeedback.
- The runtime proves `feedbackDeliveryEnvelopeControlledDraftSourceVerified`,
  `controlledDraftSourceVerified`, `sourceControlledDraftEvidencePreserved`,
  `safeLearnerFeedbackOnly`, and `studentOwnScopeEnforced`.
- The runtime remains idempotent by idempotency key and rejects conflicting
  replay.
- The runtime rejects answer text, answer keys, expected answers, explanations,
  result refs, worker/claim fields, raw model output, durable commit result
  fields, internal error messages, unsafe HTML-like text, HTTP execution,
  model inference, device control, local tool mutation, and Swarm.
- The audit proves package scripts, strict quality, root workflow coverage,
  structure verification, SDD, and architecture board track 0299.

## Performance

This is a control-plane archive persistence command step and does not change
the production durable write hot path. It is held to the Student App
control-plane target of P99 <= 50ms. Current whole-system evidence remains
`22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; no new `production10k`
run is required for this slice because no hot-path implementation or worker
configuration changed.

## Rollback

Remove the 0299 runtime, runtime tests, audit, audit tests, report, package
script, strict quality hook, root workflow coverage hook, structure verifier
entries, SDD, and architecture-board 10.39 text. Keep 0295-0298 and legacy
0275 intact because controlled draft generation, source review, source
approval, controlled-source delivery, and legacy archive persistence remain
valid independent slices until storage commit consumes 0299.
