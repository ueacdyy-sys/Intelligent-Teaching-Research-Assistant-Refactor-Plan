# SDD 0053: Teaching Attendance Student History Query View

## Problem

The root requirements keep Teaching Mode intelligent rollcall as an existing capability whose UI can be rebuilt while the function remains. SDD 0049 created sessions, SDD 0051 created record intake, and SDD 0052 added a session-scoped record query. The rebuilt desktop and student-facing views still need the legacy student attendance history read path so a principal can inspect one student's attendance timeline without loading unrelated session records.

The legacy system exposes `GET /students/{student_id}/attendance` and `RollcallService.get_student_attendance_history(student_id, limit)`. Carrying that forward as a raw unbounded list would recreate a performance risk in large classes. The refactor needs the same functional read path with Principal Context authorization and bounded, indexed pagination over `teaching_attendance_records`.

## Source Requirement References

- Root requirement: Teaching Mode includes intelligent rollcall, with UI rebuilt but function preserved.
- Legacy evidence: `backend/app/api/endpoints/students.py` exposes `/students/{student_id}/attendance`.
- Legacy evidence: `backend/app/services/rollcall_service.py` has `get_student_attendance_history(student_id, limit)`.
- Legacy evidence: `backend/app/repositories/rollcall_repository.py` queries records by `student_id` ordered by `created_at DESC`.
- SDD 0052: session-scoped record query exists, but student history was intentionally out of scope.

## Scope

In scope:

- Add `GET /v1/teaching/students/{studentId}/attendance-records`.
- Return a page of attendance record metadata for one student:
  - `id`
  - `sessionId`
  - `studentId`
  - `status`
  - `recordedByPrincipalId`
  - `signTime`
  - `note`
  - `createdAt`
- Add optional query parameters:
  - `pageSize`
  - `cursor`
- Default to the shared archive page size and enforce the shared maximum page size.
- Sort records by `createdAt DESC, id DESC`.
- Require authenticated Principal Context:
  - students with `STUDENT_OWN_READ` can list only their own attendance history.
  - teachers/admin-style principals with `TEACHING_READ`, `STUDENT_ASSIGNED_READ`, and assigned/all student access can list assigned/all students.
- Keep the endpoint metadata-only and backed by the existing `idx_teaching_attendance_records_student_created` index.

Out of scope:

- Session-scoped record query, already handled by SDD 0052.
- Attendance statistics dashboards.
- Teacher record correction/update endpoint.
- Dedicated QR/gesture/number sign-in routes.
- Random student selection.
- Teaching Mode UI work.
- OCR, RAG, model, scoring, or training dependencies.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.student-attendance-records.path.yaml`

Go service:

- Domain: student attendance history input normalization, scoping, cursor reuse, and page construction.
- Use case: `ListStudentAttendanceRecords`.
- HTTP adapter: `GET` dispatch for the student attendance-record subresource.
- PostgreSQL adapter: indexed list query over `teaching_attendance_records` by `student_id`.

## Acceptance Criteria

- Domain tests prove student ID normalization, cursor validation, page-size bounds, student-own scoping, assigned-teacher scoping, and cross-student rejection.
- Use-case tests prove authorization is scoped before repository list and pagination is built from `pageSize + 1`.
- HTTP tests prove `GET /v1/teaching/students/{studentId}/attendance-records` returns a `200` page, includes `pageInfo`, and does not leak another student's records.
- PostgreSQL adapter tests prove the query filters by `student_id`, supports cursor tuple pagination, and uses `ORDER BY created_at DESC, id DESC LIMIT`.
- Structure verification requires SDD 0053 and the new student attendance history contract/domain/use-case/PostgreSQL/HTTP test files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0053, remove the OpenAPI path reference and path file, remove student attendance record query domain/use-case/PostgreSQL files and tests, remove HTTP route/response dispatch, and remove structure verifier entries. SDD 0049 session intake, SDD 0051 record intake, and SDD 0052 session record query remain intact.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
