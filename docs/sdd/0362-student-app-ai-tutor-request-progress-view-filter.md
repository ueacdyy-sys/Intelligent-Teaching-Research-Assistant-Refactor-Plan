# SDD 0362: Student App AI Tutor Request Progress View Filter

## Problem

SDD 0361 added safe progress-list summary counts, but the Student App home
screen still has to fetch a broad list when it only needs one operational view:
auto-refreshing requests, action-ready requests, teacher-review requests, or
failed requests.

The Student App needs a server-owned progress-view filter so mobile polling and
home badges can reduce read amplification without duplicating progress-state
rules or exposing internal worker state.

## Scope

This slice adds an optional `progressView` query parameter to
`GET /v1/student-app/ai-tutor-requests`.

Supported values are:

- `ALL`
- `AUTO_REFRESH`
- `ACTION_READY`
- `TEACHER_REVIEW_REQUIRED`
- `FAILED`

The filter is normalized in the domain boundary, mapped to safe tutoring
request statuses, passed through the use case to the repository, and executed as
a multi-status PostgreSQL predicate. The response shape stays unchanged:
`data`, `pageInfo`, `summary`, private ETag headers, and pre-encode conditional
behavior remain the same.

This slice does not change the write path, model execution, OCR/RAG, Swarm,
shared cache, Redis, database schema, or Student App detail endpoint.

## Contracts

1. `progressView` is optional and additive.
2. `progressView` must not be combined with low-level `status`, except `ALL`
   keeps legacy status semantics.
3. `AUTO_REFRESH` maps to `QUEUED` and `IN_PROGRESS`.
4. `ACTION_READY` maps to `SUCCEEDED`.
5. `TEACHER_REVIEW_REQUIRED` and `FAILED` map to `FAILED`.
6. PostgreSQL receives a status-array predicate rather than filtering only after
   response construction.
7. The list response summary counts the filtered safe progress cards.
8. No worker IDs, internal errors, raw refs, lineage IDs, model output, OCR/RAG,
   Swarm state, or direct database details are exposed.

## Acceptance Criteria

- Domain tests prove progress-view normalization, status mapping, and
  ambiguous filter rejection.
- Use-case tests prove progress-view statuses reach the repository boundary.
- PostgreSQL tests prove multi-status predicates are pushed into SQL.
- HTTP tests prove `AUTO_REFRESH` returns only queued/in-progress safe cards and
  rejects ambiguous filters.
- OpenAPI documents `progressView` and its enum values.
- The audit emits runtime id
  `student_app_ai_tutor_request_progress_view_filter` with P99 <= 50ms and zero
  errors.
- Package scripts, strict quality gate, root workflow coverage, structure
  verification, root requirements trace, and architecture board track SDD 0362.

## Rollback

Remove the `progressView` parameter, domain progress-view enum and status
mapping, repository multi-status predicate, tests, 0362 audit/report, and all
0362 hook entries from package scripts, quality gate, root workflow coverage,
structure verification, root trace, and architecture board.
