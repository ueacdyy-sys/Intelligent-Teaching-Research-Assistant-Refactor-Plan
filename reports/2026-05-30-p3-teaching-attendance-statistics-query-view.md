# P3 Teaching Attendance Statistics Query View

Date: 2026-05-30

## Scope

SDD 0054 adds the attendance statistics read model for Teaching Mode intelligent rollcall:

- `GET /v1/teaching/attendance-statistics`.
- optional `className` query parameter.
- legacy-compatible summary fields:
  - `totalStudents`
  - `totalRecords`
  - `attendanceCount`
  - `absenceCount`
  - `lateCount`
  - `attendanceRate`
- Principal Context authorization for teacher/admin-style assigned or all student access.
- aggregate query over `teaching_attendance_sessions` counters without scanning attendance records.

Out of scope stayed out of the slice: student roster storage, leave-count schema changes, per-session statistics, date ranges, Teaching Mode UI charts, SDK generation, OCR, RAG, model calls, scoring, and training dependencies.

## Root Evidence

- Root requirements: intelligent rollcall keeps the existing function while the UI is rebuilt.
- Legacy API: `backend/app/api/endpoints/students.py` exposes `/rollcall/statistics`.
- Legacy service: `RollcallService.get_attendance_statistics(class_name)` returns attendance statistics.
- Legacy payload: `totalStudents`, `totalRecords`, `attendanceCount`, `absenceCount`, `lateCount`, `attendanceRate`.
- SDD 0051 already keeps session counters updated during record intake.

## Red Evidence

Structure gate before implementation:

- `npm run verify:structure`
- failed on the intentionally required but missing attendance statistics contract/domain/use-case/HTTP/PostgreSQL files.

Go test before implementation:

- `go test ./services/teaching-archive-gateway/...`
- failed on undefined `NormalizeAttendanceStatisticsInput`, `AttendanceStatisticsInput`, `AuthorizeAttendanceStatisticsQuery`, `AttendanceStatistics`, `AttendanceStatisticsQuery`, `NewGetAttendanceStatistics`, repository method `GetAttendanceStatistics`, and the new server constructor argument.

## Implementation

- Added SDD 0054 and OpenAPI path split for attendance statistics.
- Added domain normalization, authorization, and legacy-compatible aggregate payload construction.
- Added `GetAttendanceStatistics` use case.
- Added HTTP route and response presenter for `/v1/teaching/attendance-statistics`.
- Added PostgreSQL aggregate query over `teaching_attendance_sessions`.
- Added structure verifier entries for the SDD and new contract/domain/use-case/HTTP/PostgreSQL files.

## Verification

Passed:

- `npm run verify:structure`
- `go test ./services/teaching-archive-gateway/...`
- `npm test`
- `npm run quality`

Quality gate summary:

- all checks passed.
- `npm test` passed in 69665 ms.
- `go vet` passed in 64633 ms.
- `cargo test` passed in 738 ms.
- identity session runtime audit passed.
- identity access contract audit passed.
- direct-limited connection budget passed.
- PgBouncer connection budget passed.
- latest summary written to `reports/quality-gate.current.json`.

## Dependency Drift

No dependency manifests changed:

- `package.json`
- `go.work`
- `services/teaching-archive-gateway/go.mod`
- `services/teaching-archive-gateway/go.sum`
- `services/agent-harness/Cargo.toml`
- `services/agent-harness/Cargo.lock`

No OCR, RAG, model, scoring, or training dependency was added.

## Follow-Up

Next safe attendance slices:

- dedicated QR/gesture/number sign-in route and payload validation.
- teacher correction/update endpoint.
- random student selection endpoint.
- session end endpoint.
- Teaching Mode UI rebuild against the new contract.
