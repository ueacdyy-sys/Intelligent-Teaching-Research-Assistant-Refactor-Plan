# SDD 0273 - Student App AI Tutor Question-Bank Draft Answer Feedback Publication Approval

## Problem

SDD 0272 records a human-reviewed learner feedback artifact, but it still keeps
student-visible publication blocked. The next product gap is an explicit
publication approval step: a teacher or administrator must be able to approve
the reviewed feedback for a later Student App delivery runtime without the
approval step itself publishing, persisting, or rendering the feedback to the
student.

The immutable root requirements require the Student App to support AI tutoring,
student archive access, teaching materials, personalized question bank, and
scan-to-answer learning flows. This slice advances that feedback loop while
keeping student-visible delivery and durable archive persistence separated.

## Scope

Add an auditable publication approval runtime for the Student App question-bank
answer feedback chain.

The runtime consumes:

- the READY 0272 reviewed feedback artifact report;
- the reviewed learner feedback artifact;
- a human TEACHER or ADMIN publication approver;
- a policy that allows only approval evidence and still blocks delivery,
  persistence, model inference, HTTP, tools, devices, and Swarm.

The runtime records
`STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED`.

This slice intentionally does not create a student-visible delivery envelope,
publish feedback, write a database row, persist to the student archive, add an
OpenAPI path, execute HTTP, call a model, remote-control devices, mutate local
tools, or enable Swarm.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-audit.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval.current.json`
- Source evidence:
  `reports/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact.current.json`

## Acceptance Criteria

- The runtime requires a human TEACHER or ADMIN approver.
- The runtime requires READY 0272 reviewed feedback artifact evidence.
- The reviewed feedback artifact must still be `REVIEWED_NOT_PUBLISHED`.
- The approval must match artifactId, submissionId, requestId,
  questionBankDraftRef, tutoringAnalysisRequestId, and archiveItemId from the
  reviewed artifact.
- The approval must prove learner feedback review, age appropriateness,
  own-student scope, answer-key disclosure blocking, worker metadata blocking,
  raw model output blocking, internal error blocking, and future delivery
  runtime requirement.
- The runtime is idempotent by idempotency key and rejects conflicting replay.
- The runtime rejects answer text, answer keys, expected answers, explanations,
  result refs, worker/claim fields, raw model output, student delivery fields,
  internal error messages, and unsafe HTML-like text.
- The audit proves package scripts, strict quality, root workflow coverage,
  structure verification, SDD, and architecture board track 0273.

## Performance

This is a control-plane approval step and does not change the production hot
path. It is held to the Student App control-plane target of P99 <= 50ms. Current
whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`,
`0 errors`; no new `production10k` run is required for this slice.

## Rollback

Remove the 0273 runtime, runtime tests, audit, report, package script, strict
quality hook, root workflow coverage hook, structure verifier entries, SDD, and
architecture-board 10.13 text. Keep 0267-0272 intact because submission,
scoring request, worker input, safe result read, completion bridge, publication
precheck, and reviewed feedback artifact remain valid independent slices.
