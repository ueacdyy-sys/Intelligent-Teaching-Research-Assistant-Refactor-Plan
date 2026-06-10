# SDD 0358: Student App AI Tutor Request Progress Refresh Policy

## Problem

SDD 0357 lets the Student App call the safe progress action directly, but the
mobile client still has to guess whether and when to poll the request progress
endpoint. Under weak networks or impatient users, that can turn a safe read path
into avoidable read amplification.

The system needs a server-owned refresh policy for each progress card so waiting
states can refresh at a bounded cadence and terminal states stop polling.

## Scope

This slice consumes READY SDD 0357 evidence and adds `refreshPolicy` to the
safe Student App AI Tutor request progress response.

## Contracts

1. Keep the existing list and single-request progress read paths.
2. Add `refreshPolicy.autoRefresh`, `refreshPolicy.refreshAfterMs`, and
   `refreshPolicy.reason` to `StudentAppAITutorRequestProgressResponse`.
3. For `QUEUED`, return `autoRefresh=true`, `refreshAfterMs=8000`, and
   `reason=WAITING_FOR_WORKER`.
4. For `IN_PROGRESS`, return `autoRefresh=true`, `refreshAfterMs=5000`, and
   `reason=WAITING_FOR_REVIEW`.
5. For result-ready and question-bank-ready states, return
   `autoRefresh=false`, `refreshAfterMs=0`, and `reason=ACTION_READY`.
6. For teacher-review states, return `autoRefresh=false`, `refreshAfterMs=0`,
   and `reason=TEACHER_REVIEW_REQUIRED`.
7. Do not expose worker ids, internal errors, raw result refs, internal lineage,
   model output, OCR/RAG data, Swarm state, or direct database details.
8. Do not add writes, queues, model execution, OCR/RAG, or Swarm behavior.

## Acceptance Criteria

- Go domain tests cover waiting and terminal refresh policies.
- HTTP tests prove list and detail responses include safe `refreshPolicy`.
- OpenAPI constrains `refreshPolicy` and keeps forbidden internal fields out of
  the Student App progress response.
- The audit emits runtime id
  `student_app_ai_tutor_request_progress_refresh_policy` with P99 <= 50ms and
  zero errors.
- Package scripts, strict quality gate, root workflow coverage,
  structure verification, root requirements trace, and architecture board track
  SDD 0358.

## Rollback

Remove this SDD, the 0358 audit/test/report, the `refreshPolicy` response field,
the domain refresh-policy construction, the OpenAPI refresh-policy schema, and
the 0358 hook entries from package scripts, quality gate, root workflow
coverage, structure verification, root trace, and architecture board. SDD 0357
direct target URLs remain intact, but the Student App must keep choosing its own
polling cadence.
