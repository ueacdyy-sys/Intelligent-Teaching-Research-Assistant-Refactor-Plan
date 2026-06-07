# SDD 0274 - Student App AI Tutor Question-Bank Draft Answer Feedback Delivery Envelope

## Problem

SDD 0273 records human publication approval for a reviewed learner feedback
artifact, but it deliberately stops before creating anything the Student App
can render. The next product gap is the delivery envelope itself: the approved
feedback must become a safe Student App surface without turning that step into
durable student archive persistence, direct database writes, model inference,
HTTP transport, local tool mutation, or Swarm execution.

The immutable root requirements require a Student App AI tutor, personalized
question bank, student archive access, teaching material access, and scan-to-
answer learning flow. This slice advances the feedback loop from approval to a
student-visible renderable envelope while keeping durable archive persistence
as a separate reviewed slice.

## Scope

Add an auditable feedback delivery envelope runtime for the Student App
question-bank answer feedback chain.

The runtime consumes:

- the READY 0273 feedback publication approval report;
- the approved learner feedback artifact;
- a controlled Student App delivery service principal;
- a delivery request that enforces own-student scope and matches the approved
  artifact;
- a policy that allows only a renderable Student App feedback envelope.

The runtime records
`STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_READY_NOT_PERSISTED`.

This slice intentionally does not write a database row, persist to the student
archive, add an OpenAPI path, execute HTTP, call a model, remote-control
devices, mutate local tools, or enable Swarm.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-audit.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope.current.json`
- Source evidence:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval.current.json`

## Acceptance Criteria

- The runtime requires a controlled SERVICE principal with
  `STUDENT_DELIVERY_ENVELOPE` and `STUDENT_APP_DELIVERY` scopes.
- The runtime requires READY 0273 publication approval evidence.
- The approved feedback artifact must be
  `APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED`.
- The delivery request must match approvalRecordId, approvalId, artifactId,
  submissionId, requestId, questionBankDraftRef, tutoringAnalysisRequestId, and
  archiveItemId from the approval evidence.
- The delivery request must enforce `studentOwnScopeConfirmed=true` and a
  `student:` scopeRef.
- The runtime creates a `STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE` with
  visibility state `STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED`.
- The runtime is idempotent by idempotency key and rejects conflicting replay.
- The runtime rejects answer text, answer keys, expected answers, explanations,
  result refs, worker/claim fields, raw model output, persistence result
  fields, internal error messages, and unsafe HTML-like text.
- The audit proves package scripts, strict quality, root workflow coverage,
  structure verification, SDD, and architecture board track 0274.

## Performance

This is a control-plane delivery-envelope step and does not change the
production write hot path. It is held to the Student App control-plane target
of P99 <= 50ms. Current whole-system evidence remains
`22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; no new `production10k`
run is required for this slice.

## Rollback

Remove the 0274 runtime, runtime tests, audit, report, package script, strict
quality hook, root workflow coverage hook, structure verifier entries, SDD, and
architecture-board 10.14 text. Keep 0267-0273 intact because submission,
scoring request, worker input, safe result read, completion bridge, publication
precheck, reviewed feedback artifact, and publication approval remain valid
independent slices.
