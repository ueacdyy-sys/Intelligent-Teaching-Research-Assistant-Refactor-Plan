# SDD 0298 - Student App AI Tutor Question-Bank Draft Answer Feedback Delivery Envelope Controlled Draft Source

## Problem

SDD 0297 moves Student App AI Tutor feedback publication approval onto the
controlled draft source chain. The next product gap is delivery: the Student App
needs a renderable feedback envelope that can be shown to the student, while
preserving the 0295 -> 0296 -> 0297 evidence chain and still keeping durable
archive persistence as a separate reviewed step.

The immutable root requirements require the student-facing AI tutoring flow to
be useful, but not at the cost of leaking answer keys, worker state, model
output, internal errors, or unsafe automated writes. This slice therefore
creates a renderable envelope only after controlled-source publication approval
has passed.

## Scope

Add an auditable Student App feedback delivery envelope runtime that consumes
0297 controlled-draft-source publication approval evidence.

The runtime consumes:

- the READY 0297 publication approval controlled draft source report;
- the approved learner feedback artifact and its source controlled draft ref;
- a controlled `STUDENT_DELIVERY_RUNTIME` service principal;
- a delivery request that matches approvalRecordId, approvalId,
  sourceControlledDraftArtifactId, approvedFeedbackArtifactId, submissionId,
  requestId, questionBankDraftRef, tutoringAnalysisRequestId, archiveItemId,
  and student scope;
- a policy that allows only student app rendering and still blocks database
  writes, archive persistence, model inference, HTTP, tools, devices, and Swarm.

The runtime records
`STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_READY_NOT_PERSISTED`
and returns a student-visible envelope with
`STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED`.

This slice intentionally does not write a database row, persist to the student
archive, add an OpenAPI path, execute HTTP, call a model, remote-control
devices, mutate local tools, or enable Swarm.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.current.json`
- Source evidence:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source.current.json`

## Acceptance Criteria

- The runtime requires READY 0297 source approval evidence.
- The runtime requires a SERVICE principal entering through
  `STUDENT_DELIVERY_RUNTIME` with `TEACHING_READ`,
  `STUDENT_DELIVERY_ENVELOPE`, and `STUDENT_APP_DELIVERY`.
- The delivery request must match the 0297 approval record and approved
  feedback artifact on approval ids, artifact ids, submissionId, requestId,
  questionBankDraftRef, tutoringAnalysisRequestId, archiveItemId, and
  `student:` scope.
- The envelope must preserve source controlled draft evidence and expose only
  safe score summary and learner feedback.
- The runtime must prove `controlledDraftSourceVerified`,
  `publicationApprovalVerified`, `safeLearnerFeedbackOnly`,
  `studentOwnScopeEnforced`, and `sourceControlledDraftEvidencePreserved`.
- The runtime must keep durable archive persistence, main database write,
  student archive write, model inference, HTTP, device control, local tool
  mutation, and Swarm disabled.
- The runtime is idempotent by idempotency key and rejects conflicting replay.
- The runtime rejects answer text, answer keys, expected answers, explanations,
  result refs, worker/claim fields, raw model output, database write results,
  student archive persistence results, internal error messages, and unsafe
  answer-key text.
- The audit proves package scripts, strict quality, root workflow coverage,
  structure verification, SDD, and architecture board track 0298.

## Performance

This is a control-plane delivery-envelope step and does not change the
production hot path. It is held to the Student App control-plane target of
P99 <= 50ms. Current whole-system evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`; no new `production10k` run is required for this
slice because no hot-path implementation changed.

## Rollback

Remove the 0298 runtime, runtime tests, audit, audit tests, report, package
script, strict quality hook, root workflow coverage hook, structure verifier
entries, SDD, and architecture-board 10.38 text. Keep 0295-0297 and legacy
0274 intact because controlled draft generation, source review, source approval,
and the legacy delivery envelope remain valid independent slices until archive
persistence consumes 0298.
