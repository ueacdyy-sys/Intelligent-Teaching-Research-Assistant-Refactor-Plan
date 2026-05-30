# SDD 0052: Teaching Attendance Record Query View

## Problem

The root requirements keep Teaching Mode intelligent rollcall as an existing capability whose UI can be rebuilt while the function remains. SDD 0049 created attendance sessions and SDD 0051 created record intake, but the desktop teaching UI still cannot load the records for a session to verify who is present, absent, late, or on leave.

The legacy system exposes `GET /rollcall/sessions/{session_id}/records` and returns the rollcall records for a session. Carrying that behavior forward as an unbounded list would work for small classes but would weaken the refactor's performance posture. The refactor needs the same functional read path with Principal Context authorization and bounded, indexed pagination.

## Source Requirement References

- Root requirement: Teaching Mode includes intelligent rollcall, with UI rebuilt but function preserved.
- Legacy evidence: `backend/app/services/rollcall_service.py` has `get_session_records(session_id)`.
- Legacy evidence: `backend/app/api/endpoints/students.py` exposes `/rollcall/sessions/{session_id}/records`.
- SDD 0051: attendance record intake exists, but attendance record list/query views were intentionally out of scope.

## Scope

In scope:

- Add `GET /v1/teaching/attendance-sessions/{sessionId}/records`.
- Return a page of attendance record metadata for one session:
  - `id`
  - `sessionId`
  - `studentId`
  - `status`
  - `recordedByPrincipalId`
  - `signTime`
  - `note`
  - `createdAt`
- Add optional query parameters:
  - `studentId`
  - `pageSize`
  - `cursor`
- Default to the shared archive page size and enforce the shared maximum page size.
- Sort records by `createdAt DESC, id DESC`.
- Require authenticated Principal Context:
  - teachers/admin-style principals with `TEACHING_READ` and assigned/all student access can list assigned/all students.
  - students with `STUDENT_OWN_READ` can list only their own row in a session.
- Return not found when the attendance session does not exist.
- Keep the endpoint metadata-only and PostgreSQL-indexed.

Out of scope:

- Student aggregate attendance history endpoint.
- Attendance statistics dashboards.
- Teacher record correction/update endpoint.
- Dedicated QR/gesture/number sign-in routes.
- Random student selection.
- Teaching Mode UI work.
- OCR, RAG, model, scoring, or training dependencies.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.attendance-session-records.path.yaml`

Go service:

- Domain: attendance record list input normalization, scoping, cursor encoding/decoding, and page construction.
- Use case: `ListAttendanceRecords`.
- HTTP adapter: `GET` dispatch for attendance session record subresource.
- PostgreSQL adapter: indexed list query over `teaching_attendance_records`.

## Acceptance Criteria

- Domain tests prove query normalization, cursor validation, page-size bounds, page construction, and student-own scoping.
- Use-case tests prove the session is loaded, missing sessions return not found, authorization is scoped before repository list, and pagination is built from `pageSize + 1`.
- HTTP tests prove `GET /v1/teaching/attendance-sessions/{sessionId}/records` returns a `200` page, includes pageInfo, and does not leak unscoped student records.
- PostgreSQL adapter tests prove the query filters by `session_id`, optional/scoped `student_id`, cursor tuple, and uses `ORDER BY created_at DESC, id DESC LIMIT`.
- Structure verification requires SDD 0052 and the new attendance record query domain/use-case/PostgreSQL/HTTP test files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0052, remove the OpenAPI `get` operation, remove attendance record query domain/use-case/PostgreSQL files and tests, remove HTTP `GET` dispatch and response mapping, and remove structure verifier entries. SDD 0049 session intake and SDD 0051 record intake remain intact.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
