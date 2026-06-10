# SDD 0363: Student App AI Tutor Request Progress Count-Only Summary

## Problem

SDD 0362 lets the Student App filter progress lists by safe progress view, but
the home screen still has a lighter read case: it often only needs badge counts
for waiting requests, action-ready requests, teacher-review requests, and
failed requests.

Using the list endpoint for count-only UI still loads request rows, builds safe
progress cards, and computes summary counts in the presenter. That is safe, but
it is unnecessary read amplification for high-concurrency polling.

## Scope

This slice adds `GET /v1/student-app/ai-tutor-requests/summary`.

The endpoint returns only:

```json
{
  "summary": {
    "totalCount": 5,
    "autoRefreshCount": 2,
    "actionReadyCount": 2,
    "teacherReviewRequiredCount": 1,
    "failedCount": 1
  }
}
```

The domain owns the status-to-summary mapping, the use case calls a count-only
reader, and PostgreSQL executes `SELECT status, COUNT(*) ... GROUP BY status`
under the same Student App own-student scope.

This slice does not change the write path, database schema, Redis/shared cache,
model execution, OCR/RAG, Swarm, result publishing, list pagination, or request
detail endpoint.

## Contracts

1. Only authenticated Student App own-student principals may read the summary.
2. The response contains `summary` only; it does not contain `data`, `pageInfo`,
   request IDs, archive item IDs, result refs, worker IDs, internal errors,
   prompts, model output, OCR/RAG chunks, or Swarm state.
3. `QUEUED` and `IN_PROGRESS` contribute to `autoRefreshCount`.
4. `SUCCEEDED` contributes to `actionReadyCount`.
5. `FAILED` contributes to both `teacherReviewRequiredCount` and `failedCount`.
6. The repository must aggregate by status in PostgreSQL and must not select
   full request rows for this endpoint.
7. The endpoint uses the same private conditional cache header policy as the
   progress list/detail endpoints.

## Acceptance Criteria

- Domain tests prove own-student summary scoping, status-count mapping, and
  unsafe count rejection.
- Use-case tests prove the summary path calls the count-only reader before
  building the domain summary.
- PostgreSQL tests prove a count-only grouped query with no `ORDER BY`,
  `LIMIT`, or full-row request fields.
- HTTP tests prove `/summary` returns a count-only safe response, supports
  private conditional 304, and does not leak list or internal fields.
- OpenAPI documents `/v1/student-app/ai-tutor-requests/summary` and the
  summary-only response schema.
- The audit emits runtime id
  `student_app_ai_tutor_request_progress_summary_count` with P99 <= 50ms and
  zero errors.
- Package scripts, strict quality gate, root workflow coverage, structure
  verification, root requirements trace, and architecture board track SDD 0363.

## Rollback

Remove the summary endpoint, domain summary input/count builder, count-only
use case, PostgreSQL grouped count method, HTTP route/handler/ETag, OpenAPI
path/schema, tests, 0363 audit/report, and all 0363 hook entries from package
scripts, quality gate, root workflow coverage, structure verification, root
trace, and architecture board.
