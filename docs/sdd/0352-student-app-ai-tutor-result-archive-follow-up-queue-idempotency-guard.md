# SDD 0352: Student App AI Tutor Result Archive Follow-up Queue Idempotency Guard

## Problem

SDD 0351 bounds result-archive follow-up depth, but it does not stop repeated
submits of the same still-pending follow-up action. Under mobile retry, double
tap, weak networks, or client-side replay, one archived AI Tutor result could
still create multiple queued requests at the same depth. That turns a safe
two-step follow-up into avoidable database write amplification.

## Scope

This slice consumes READY SDD 0351
`STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_DEPTH_BUDGET_GUARD_VERIFIED`
evidence and adds an idempotent queue-admission guard for pending
`AI_TUTOR_RESULT_ARCHIVE` follow-up requests.

- Workload type:
  `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_QUEUE_IDEMPOTENCY_GUARD`
- Runtime evidence id:
  `student_app_ai_tutor_result_archive_follow_up_queue_idempotency_guard`
- Report:
  `reports/student-app-ai-tutor-result-archive-follow-up-queue-idempotency-guard.current.json`
- Ready status:
  `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_QUEUE_IDEMPOTENCY_GUARD_VERIFIED`

## Contracts

1. Require READY 0351 depth-budget evidence.
2. Build a server-normalized pending follow-up query from the created tutoring
   request shape, not from raw client input.
3. Treat only `QUEUED` and `IN_PROGRESS` tutoring requests as pending.
4. Reuse an existing pending request for the same archive item, requesting
   principal, question-bank intent, result-archive source, follow-up depth, and
   student scope.
5. Allow a new follow-up request after the previous request reaches a terminal
   state (`SUCCEEDED` or `FAILED`).
6. Add a PostgreSQL partial unique index for pending result-archive follow-up
   requests so concurrent retries cannot create unlimited duplicate rows.
7. Keep the guard inside the existing Student App AI Tutor request endpoint;
   no new public endpoint is introduced.
8. Keep JavaScript audit evidence contract-only: no DB, SQL execution, HTTP,
   model call, OCR/RAG, tools, or Swarm.

## Safety Invariants

- Client retry does not decide idempotency by itself.
- The server rebuilds and validates the result-archive action source before
  idempotency lookup.
- Pending duplicate follow-ups return the existing request instead of writing a
  new row.
- Terminal follow-ups do not permanently block a future student action.
- The database keeps a last-line partial unique guard for concurrent writers.
- This slice reduces write amplification risk; it does not expand AI/model
  execution scope.

## Acceptance Criteria

- `node tools/student-app-ai-tutor-result-archive-follow-up-queue-idempotency-guard-audit.mjs`
  returns READY.
- Go usecase tests prove pending duplicate reuse and terminal-state re-create.
- Go domain tests cover pending status classification and normalized pending
  query construction.
- PostgreSQL repository tests cover the pending lookup query shape.
- PostgreSQL schema tests cover the partial unique index predicate.
- Root workflow, structure verifier, strict quality gate, root trace, and
  architecture board all track 0352.
- Existing production10k evidence remains the performance basis. This slice is
  a write-amplification guard and only needs a light contract probe unless the
  storage path or worker topology changes again.

## Rollback

Remove this SDD, the 0352 audit/test/report, the pending follow-up query type,
the usecase reuse hook, the repository lookup, the partial unique index, and
the 0352 entries from package scripts, quality gate, root workflow coverage,
structure verification, root trace, and architecture board. The 0351 depth
budget remains intact, but duplicate pending follow-up writes would no longer
be coalesced.
