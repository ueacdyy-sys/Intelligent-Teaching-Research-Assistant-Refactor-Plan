# SDD 0272 - Student App AI Tutor Question-Bank Draft Answer Reviewed Feedback Artifact

## Problem

SDD 0271 correctly blocks student-visible feedback after scoring completion
until a reviewed feedback artifact exists. The next product gap is the artifact
itself: the Student App AI tutor chain needs a safe learner-facing feedback
object that can later enter publication approval without exposing answer keys,
worker metadata, raw model output, result refs, or internal errors.

The immutable root requirements require the Student App to support an AI tutor,
student archive, teaching materials, personalized question bank, and scan-to-
answer learning flow. This slice advances that chain without turning a score
summary into unreviewed student feedback.

## Scope

Add an auditable reviewed feedback artifact runtime for the Student App
question-bank answer scoring chain.

The runtime consumes:

- the READY 0271 feedback publication precheck report;
- the safe Student App scoring result embedded in the precheck evidence;
- a human teacher/admin review;
- a learner-facing feedback artifact with summary, encouragement, next steps,
  misconception tags, and practice suggestions;
- a policy that still blocks publication.

The runtime records
`STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_READY_NOT_PUBLISHED`.

This slice intentionally does not call a model, generate feedback from raw
answers, write a database row, add an OpenAPI path, execute HTTP, publish
student-visible content, remote-control devices, mutate local tools, or enable
Swarm.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-audit.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact.current.json`
- Source evidence:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.current.json`

## Acceptance Criteria

- The runtime requires a human TEACHER or ADMIN reviewer.
- The runtime requires READY 0271 feedback publication precheck evidence.
- The runtime requires a SUCCEEDED safe Student App scoring result.
- The reviewed feedback artifact must match submissionId, requestId,
  questionBankDraftRef, tutoringAnalysisRequestId, and archiveItemId from the
  safe result.
- The artifact must be `REVIEWED_NOT_PUBLISHED`.
- The human review must prove age appropriateness, own-student scope, answer-key
  removal, worker metadata removal, raw model output removal, internal error
  removal, and publication approval still required.
- The runtime is idempotent by idempotency key and rejects conflicting replay.
- The runtime rejects answer text, answer keys, expected answers, explanations,
  result refs, worker/claim fields, raw model output, publication fields,
  internal error messages, and unsafe HTML-like text.
- The audit proves package scripts, strict quality, root workflow coverage,
  structure verification, SDD, and architecture board track 0272.

## Performance

This is a control-plane artifact admission step and does not change the
production hot path. It is held to the Student App control-plane target of
P99 <= 50ms. Current whole-system evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`; no new `production10k` run is required for this
slice.

## Rollback

Remove the 0272 runtime, runtime tests, audit, report, package script, strict
quality hook, root workflow coverage hook, structure verifier entries, SDD, and
architecture-board 10.12 text. Keep 0267-0271 intact because submission,
scoring request, worker input, safe result read, completion bridge, and
publication precheck remain valid independent slices.
