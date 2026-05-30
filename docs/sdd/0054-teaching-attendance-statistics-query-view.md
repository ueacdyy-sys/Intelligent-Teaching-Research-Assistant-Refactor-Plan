# SDD 0054: Teaching Attendance Statistics Query View

## Problem

The root requirements keep Teaching Mode intelligent rollcall as an existing capability whose UI can be rebuilt while the function remains. SDD 0049 through SDD 0053 now cover session creation, record intake, session record lists, and student history. The rebuilt UI still needs the legacy attendance statistics read path for summary cards and charts.

The legacy system exposes `GET /rollcall/statistics` and returns `totalStudents`, `totalRecords`, `attendanceCount`, `absenceCount`, `lateCount`, and `attendanceRate`, optionally filtered by class name. Recreating that behavior by loading all students or all attendance records would weaken the refactor's performance posture. The refactor should serve the same summary shape from session counters, with Principal Context authorization and a single aggregate query.

## Source Requirement References

- Root requirement: Teaching Mode includes intelligent rollcall, with UI rebuilt but function preserved.
- Legacy evidence: `backend/app/api/endpoints/students.py` exposes `/rollcall/statistics`.
- Legacy evidence: `backend/app/services/rollcall_service.py` has `get_attendance_statistics(class_name)`.
- Legacy evidence: the statistics payload returns `totalStudents`, `totalRecords`, `attendanceCount`, `absenceCount`, `lateCount`, and `attendanceRate`.
- SDD 0051: attendance record intake atomically updates attendance session counters.

## Scope

In scope:

- Add `GET /v1/teaching/attendance-statistics`.
- Add optional query parameter:
  - `className`
- Return metadata-only aggregate statistics:
  - `totalStudents`
  - `totalRecords`
  - `attendanceCount`
  - `absenceCount`
  - `lateCount`
  - `attendanceRate`
- Compute statistics from `teaching_attendance_sessions` counters:
  - `totalStudents` is the maximum `expected_student_count` among matched sessions.
  - `totalRecords` is `attendanceCount + absenceCount + lateCount`.
  - `attendanceRate` is `attendanceCount / totalRecords`, or `0` when no records exist.
- Require authenticated Principal Context with `TEACHING_READ` and assigned/all student access.
- Keep the endpoint metadata-only and avoid scanning `teaching_attendance_records`.

Out of scope:

- Student roster storage or student master-data migration.
- Leave-count schema changes.
- Per-session statistics endpoint.
- Date-range statistics.
- Teaching Mode UI charts.
- OCR, RAG, model, scoring, or training dependencies.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.attendance-statistics.path.yaml`

Go service:

- Domain: statistics input normalization, authorization, and aggregate payload construction.
- Use case: `GetAttendanceStatistics`.
- HTTP adapter: `GET /v1/teaching/attendance-statistics`.
- PostgreSQL adapter: aggregate query over `teaching_attendance_sessions`.

## Acceptance Criteria

- Domain tests prove class-name normalization, authorization, cross-role rejection, non-negative count validation, and zero-record attendance-rate behavior.
- Use-case tests prove authorization happens before repository access and aggregate totals are returned.
- HTTP tests prove `GET /v1/teaching/attendance-statistics?className=...` returns the legacy-compatible summary shape.
- PostgreSQL adapter tests prove the query reads `teaching_attendance_sessions`, filters by class name when provided, aggregates counters, and does not reference `teaching_attendance_records`.
- Structure verification requires SDD 0054 and the new attendance statistics contract/domain/use-case/PostgreSQL/HTTP test files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0054, remove the OpenAPI path reference and path file, remove attendance statistics domain/use-case/PostgreSQL files and tests, remove HTTP route/response dispatch, and remove structure verifier entries. SDD 0049 through SDD 0053 remain intact.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
