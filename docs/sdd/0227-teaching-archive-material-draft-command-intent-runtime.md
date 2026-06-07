# SDD 0227: Teaching Archive Material Draft Command Intent Runtime

## Problem

The immutable root requirements keep archive materials as a core teaching and student-learning surface: student archives, teaching materials, quizzes, papers, handouts, homework, and later AI tutoring all depend on trustworthy material records. The Agent architecture already allows `draft_archive_material` as a controlled write intent, but a contract-only gateway is not enough for whole-system refactor progress.

## Scope

Add `TeachingDraftCommandPort.submitArchiveMaterialDraftIntent` as the second real controlled Agent write-intent runtime slice.

The runtime accepts an archive material draft proposal for human review and appends it to the teaching command log. It does not create a final `ArchiveItem`, does not enqueue OCR/RAG/training work, does not write AI grading state, and does not expose execution candidates.

## Contracts

- Input requires principal context, target owner, material type, source refs, draft artifact ref, SharedContext, GuardrailResult, RouteDecision, input hash, output summary, approval artifact, rollback plan, audit trace, and idempotency key.
- Teachers, admins, and services with `TEACHING_WRITE` may submit.
- Remote commands may submit only with `AGENT_COMMAND_SUBMIT` and `RequiresHarnessApproval=true`.
- Student principals are rejected.
- HTTP returns `202 REVIEW_REQUIRED` and `X-Teaching-Write-Acceptance: review-only-command-intent`.
- Command log append is durable intent evidence only; projection remains disabled for this intent.

## Acceptance Criteria

- Domain tests cover normalization, required review evidence, student target validation, remote harness gating, student rejection, and server ID prefix.
- Use-case tests cover command-port submission, forbidden principal short-circuit, and ID prefix enforcement.
- Commandlog tests cover append-only persistence and no projection queue.
- HTTP tests cover `202`, command append timing, review-only header, student rejection, and no final `contentRef` leakage.
- `tools/teaching-archive-material-draft-intent-audit.mjs` locks contract, runtime, wiring, and structure evidence into the quality gate.

## Performance Note

This slice intentionally uses the same durable command-intent path as quiz drafts. It should not reopen broad `production10k` testing by itself. The current whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this slice adds boundary coverage, not a new throughput claim.

## Rollback

Remove the route, OpenAPI path, use case, domain intent, commandlog append method, audit script, and quality-gate registration. Existing command-log records are append-only review artifacts and can be left unread by projection replay because they do not create business rows.
