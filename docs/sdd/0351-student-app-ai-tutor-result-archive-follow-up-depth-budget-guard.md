# SDD 0351: Student App AI Tutor Result Archive Follow-up Depth Budget Guard

## Problem

SDD 0350 proves that a result-archive follow-up request can continue through
the queued worker path. That continuity is necessary, but without a server-side
depth and budget guard the feature can become a write-amplification loop:
student-visible archived results could keep offering new follow-up actions,
each action could enqueue another AI Tutor request, and worker processing could
repeat the same chain without a hard stop.

## Scope

This slice consumes READY SDD 0350
`STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_WORKER_CONTINUITY_VERIFIED`
evidence and adds a bounded follow-up depth contract across the Student App
result archive read/render/actions path, queued tutoring request persistence,
OpenAPI contracts, and worker-safe input.

- Workload type:
  `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_DEPTH_BUDGET_GUARD`
- Runtime evidence id:
  `student_app_ai_tutor_result_archive_follow_up_depth_budget_guard`
- Report:
  `reports/student-app-ai-tutor-result-archive-follow-up-depth-budget-guard.current.json`
- Ready status:
  `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_DEPTH_BUDGET_GUARD_VERIFIED`

## Contracts

1. Require READY 0350 worker-continuity evidence.
2. Persist result-archive snapshot `follow_up_depth` in the Teaching Archive
   database and normalize it as a server-side value in the domain model.
3. Expose result-archive learning-actions top-level `followUpDepth` as the
   current archive depth and action-source `followUpDepth` as the next depth.
4. Stop emitting follow-up actions when the current archive depth reaches the
   maximum depth, currently `2`.
5. Require `learningActionSource.followUpDepth` for
   `AI_TUTOR_RESULT_ARCHIVE` client requests, reject it for
   `PUBLISHED_STUDY_PACKET`, and keep the accepted value inside the server
   range `1..2`.
6. Rebuild the result-archive learning actions during queue admission and
   accept only a source whose action type, intent, endpoint, source type, and
   follow-up depth match regenerated server actions.
7. Persist `source_follow_up_depth` on tutoring analysis requests and carry it
   into worker input.
8. Rebuild result-archive learning actions again in the worker input path and
   reject requests whose persisted follow-up depth no longer matches an
   available regenerated action.
9. Document the result-archive follow-up depth contract in OpenAPI, including
   `actions.minItems: 0` for max-depth archives.

## Safety Invariants

- The client never decides the next follow-up depth by itself.
- Result-archive follow-up depth is capped at 2 in domain code, request
  normalization, queue admission, persistence, worker input, and OpenAPI.
- Published study-packet sources cannot smuggle result-archive depth fields.
- Max-depth archives return no next follow-up actions and therefore cannot
  create another queued request through the normal Student App action path.
- Worker input cannot bypass the depth guard by using a stale or tampered
  persisted request.
- No new public endpoint is introduced.
- Student-facing request responses still do not expose internal queued source
  fields.
- JavaScript evidence does not directly access DB, execute SQL/HTTP, call a
  model, start OCR/RAG, invoke tools, or start Swarm.

## Acceptance Criteria

- `node tools/student-app-ai-tutor-result-archive-follow-up-depth-budget-guard-audit.mjs`
  returns READY.
- Go domain tests cover depth `0 -> 1`, depth `1 -> 2`, and max depth `2`
  returning zero learning actions.
- Go usecase tests reject tampered follow-up depth and max-depth follow-up
  queue admission.
- Go worker-input tests reject persisted follow-up depth mismatches.
- PostgreSQL schema, scanners, and repository tests include snapshot
  `follow_up_depth` and tutoring request `source_follow_up_depth`.
- OpenAPI requires `followUpDepth` for result-archive sources and forbids it
  for published study-packet sources.
- Root workflow, structure verifier, strict quality gate, root trace, and
  architecture board all track 0351.
- Existing full-system production10k evidence remains the performance basis;
  this slice reduces loop amplification risk but does not justify another heavy
  benchmark by itself.

## Rollback

Remove this SDD, the 0351 audit/test/report, the `FollowUpDepth` fields and
schema columns, the depth validations in queue admission and worker input, and
the 0351 hook entries from package scripts, quality gate, root workflow
coverage, structure verification, root trace, and architecture board. The 0350
worker-continuity path then remains functional but no longer has a server-side
follow-up loop budget.
