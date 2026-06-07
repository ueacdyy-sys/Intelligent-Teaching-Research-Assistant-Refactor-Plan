# SDD 0271 - Student App AI Tutor Question-Bank Draft Answer Feedback Publication Precheck

## Problem

SDD 0292 now proves that a sanitized question-bank answer scoring artifact has
entered the existing `RecordAIGradingResult` result state machine through the
scoring result persistence bridge. The next risk is publication drift: a future
client or agent could treat the persisted safe score summary as full
student-visible feedback and expose answer keys, worker metadata, raw model
output, result refs, or internal failure details before a reviewed feedback
artifact exists.

The root requirements require a Student App AI tutor, personalized question
bank, student archive, teaching material access, and scan-to-answer flow. That
needs a controlled path from scoring to feedback, but feedback must not become a
shortcut around review and safety boundaries.

## Scope

Add an auditable feedback publication precheck runtime for the Student App
question-bank draft answer scoring chain.

The runtime consumes:

- the 0292 scoring result persistence bridge report;
- the Student App safe scoring result shape;
- a feedback publication policy that requires a reviewed feedback artifact,
  human review, safe student result evidence, and no answer-key disclosure.

The runtime records a deterministic command-log entry with decision
`BLOCK_UNTIL_REVIEWED_FEEDBACK`.

This slice intentionally does not generate detailed feedback, invoke a model,
publish a student-visible feedback body, add a database table, add an OpenAPI
path, execute HTTP, run tools, or enable Swarm.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-audit.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.current.json`
- Source evidence:
  `reports/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.current.json`

## Acceptance Criteria

- The runtime requires STUDENT + STUDENT_APP + STUDENT_OWN_READ + OWN access.
- The runtime requires READY 0292 scoring result persistence bridge evidence.
- The runtime verifies that the persisted scoring result and safe student
  scoring result agree on `requestId` and `submissionId`.
- The runtime requires a SUCCEEDED safe Student App scoring result.
- The runtime records `BLOCK_UNTIL_REVIEWED_FEEDBACK`.
- The runtime is idempotent by idempotency key and rejects conflicting replay.
- The runtime rejects answer text, expected answer, explanation, result refs,
  worker fields, claim fields, raw model output, generated feedback,
  publication fields, and internal error messages.
- The audit proves the runtime is tracked by package scripts, strict quality,
  root workflow coverage, structure verification, SDD, and architecture board.

## Performance

This is a control-plane precheck and does not change the production hot path.
It is held to the Student App control-plane target of P99 <= 50ms. Current whole
system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`;
no new `production10k` run is required for this slice.

## Rollback

Remove the 0271 runtime, runtime tests, audit, report, package script, strict
quality hook, root workflow coverage hook, structure verifier entries, SDD, and
architecture-board 10.11/10.33 text. Keep 0267-0270 and 0292 intact because
scoring request, worker input, safe result read, completion bridge, and
persisted scoring result bridge remain valid independent slices.
