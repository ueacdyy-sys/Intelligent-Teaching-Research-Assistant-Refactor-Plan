# SDD 0226: Teaching Quiz Draft Command Intent Runtime

## Problem

SDD 0225 made Agent write intent a review-only contract, but the Teaching
runtime still needed one real command port to prove the contract can be wired
without creating final business state. The highest-value first slice is
`TeachingDraftCommandPort.submitQuizDraftIntent`, because quiz generation maps
directly to the root Teaching Mode and in-class quiz requirements while still
being dangerous enough to require approval, rollback, idempotency, and audit
evidence.

## Scope

In scope:

- Add the Teaching quiz draft intent domain model and validation.
- Add the `TeachingDraftCommandPort` use-case boundary.
- Record quiz draft intents in the Teaching command log as append-only JSONL.
- Expose `POST /v1/teaching/quiz-draft-intents`.
- Require SharedContext, guardrail, route decision, input hash, output summary,
  approval artifact, rollback plan, audit trace, and idempotency evidence.
- Keep the result as `REVIEW_REQUIRED` and return `202 Accepted`.

Out of scope:

- Creating final quiz questions.
- Writing final AI grading, final student evaluation, or workflow publish
  state.
- Exposing execution candidates.
- Adding new broad production10k benchmark evidence.

## Contracts

- `contracts/openapi/teaching-archive.quiz-draft-intents.path.yaml` defines
  the HTTP entry contract.
- `services/teaching-archive-gateway/internal/domain/teaching_quiz_draft_intent.go`
  defines validation, authorization, and review-only status.
- `services/teaching-archive-gateway/internal/usecase/submit_teaching_quiz_draft_intent.go`
  defines `TeachingDraftCommandPort`.
- `services/teaching-archive-gateway/internal/adapter/commandlog/quiz_draft_intent.go`
  records command intent evidence without projection.
- `tools/teaching-quiz-draft-intent-audit.mjs` checks that the runtime remains
  review-only.

## Acceptance Criteria

- Domain tests prove required evidence, Harness-gated remote submission, and
  student rejection.
- Use-case tests prove the inner layer depends only on the command port.
- Command-log tests prove `submit_teaching_quiz_draft_intent` is appended
  without queue projection.
- HTTP tests prove the endpoint returns `202 Accepted` and does not return
  final quiz content.
- The audit reports `READY`.
- `npm run verify:structure` includes the runtime files and contract.

## Rollback

Remove the Teaching quiz draft intent domain/use-case/HTTP/commandlog files,
remove the OpenAPI path, remove the audit tool and package script, remove the
structure verifier entries, remove this SDD, and run focused Go tests plus
`npm run verify:structure` again.

## Observability And Performance Evidence

This slice reuses command append timing in `Server-Timing` and command-log
diagnostics. It intentionally does not add a new production10k run. The current
whole-system performance conclusion remains the existing promoted evidence:
22,435.1 read/write RPS, P99 44.44ms, 0 errors. The useful progress here is a
safer runtime write-intent boundary, not a new peak number.
