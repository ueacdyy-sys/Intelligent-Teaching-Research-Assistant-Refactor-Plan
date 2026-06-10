# SDD 0361: Student App AI Tutor Request Progress Summary

## Problem

SDD 0354-0360 made Student App AI Tutor progress reads safe and cheaper for
unchanged polling, but the list response still forces the mobile shell to scan
every progress card before it can show simple badges such as "still refreshing",
"ready to open", or "needs teacher review".

The Student App needs a small server-derived summary on the progress list so the
home screen can render next-action state without duplicating card-state rules in
the client.

## Scope

This slice adds a required `summary` object to the Student App AI Tutor progress
list response. The summary is derived only from already sanitized
`StudentAppAITutorRequestProgressCard` fields after authorization, scoped use
case reads, and safe card construction have completed.

This slice does not change the detail response, write path, model execution,
OCR/RAG, Swarm, Redis/shared cache behavior, or database schema. Because the
list response shape changes, the list ETag seed moves from `v1` to `v2`; the
detail ETag remains `v1`.

## Contracts

1. Keep existing `data` and `pageInfo` list fields.
2. Add required `summary` with:
   - `totalCount`
   - `autoRefreshCount`
   - `actionReadyCount`
   - `teacherReviewRequiredCount`
   - `failedCount`
3. Compute `totalCount` from the number of safe progress cards.
4. Compute `autoRefreshCount` from `RefreshPolicy.AutoRefresh`.
5. Compute action counts from `PrimaryAction.State`.
6. Compute `failedCount` from safe card `Status`.
7. Do not expose worker ids, internal errors, raw result refs, lineage ids,
   model output, OCR/RAG data, Swarm state, or direct database details.
8. Bump only the list validator seed to
   `student-app-ai-tutor-request-progress-list/v2`.

## Acceptance Criteria

- Go HTTP tests prove a mixed-state list returns correct summary counts.
- Go HTTP tests prove internal worker fields, raw refs, and internal errors do
  not leak through the summary response.
- OpenAPI marks `summary` as required on the list response and forbids additional
  summary properties.
- The 0360 pre-encode validator audit expects the v2 list seed.
- The audit emits runtime id
  `student_app_ai_tutor_request_progress_summary` with P99 <= 50ms and zero
  errors.
- Package scripts, strict quality gate, root workflow coverage, structure
  verification, root requirements trace, and architecture board track SDD 0361.

## Rollback

Remove the list `summary` response field, summary presenter helper, OpenAPI
summary schema, 0361 audit/test/report, and all 0361 hook entries from package
scripts, quality gate, root workflow coverage, structure verification, root
trace, and architecture board. Restore the list validator seed to `v1` only if
no deployed client has consumed the summary response shape.
