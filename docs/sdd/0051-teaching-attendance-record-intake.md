# SDD 0051: Teaching Attendance Record Intake

## Problem

The root requirements keep Teaching Mode intelligent rollcall as an existing capability whose UI can be rebuilt while the function remains. SDD 0049 created metadata-only attendance sessions, but a session without records cannot support QR code sign-in, teacher corrections, attendance counters, later statistics, or student attendance history.

The legacy implementation records one row per student per rollcall session, accepts `present`, `absent`, `late`, and `leave`, sets sign time only for present or late records, and prevents repeated student sign-in from double-counting by returning an existing record. The refactor needs the same behavioral foundation inside the Go-owned Teaching Mode boundary, under Principal Context authorization and PostgreSQL connection budgeting.

## Source Requirement References

- Root requirement: Teaching Mode includes intelligent rollcall, with UI rebuilt but function preserved.
- Legacy evidence: `backend/app/models/student.py` defines `RollcallRecord` with `session_id`, `student_id`, `status`, `sign_time`, `note`, and `created_at`.
- Legacy evidence: `backend/app/services/rollcall_service.py` sets `sign_time` only for `present` and `late` and updates session counters after recording.
- Legacy evidence: `backend/app/api/endpoints/students.py` returns an existing sign-in record instead of creating a duplicate.
- SDD 0049: attendance sessions exist, but records, statistics, random selection, and UI remain future slices.

## Scope

In scope:

- Add `POST /v1/teaching/attendance-sessions/{sessionId}/records`.
- Accept metadata-only attendance records:
  - required `studentId`.
  - required `status`: `PRESENT`, `ABSENT`, `LATE`, or `LEAVE`.
  - optional `note`.
- Normalize legacy lowercase status values to uppercase.
- Require an authenticated Principal Context:
  - teachers/admin-style principals with `TEACHING_WRITE` and assigned/all student access can record assigned students.
  - students with `STUDENT_OWN_WRITE` and own student access can record themselves for sign-in.
- Reject ended attendance sessions.
- Create `att_rec_` attendance record ids.
- Set `signTime` only for `PRESENT` and `LATE`.
- Persist one record per `(sessionId, studentId)` and return the existing active-session record on duplicate intake without incrementing counters again.
- Atomically update session counters only for newly inserted records:
  - `PRESENT` increments `present_count`.
  - `ABSENT` increments `absent_count`.
  - `LATE` increments `late_count`.
  - `LEAVE` does not increment the existing three counters.

Out of scope:

- Student aggregate attendance counters.
- Attendance record update/correction after initial intake.
- Attendance record list/query views.
- Dedicated QR/gesture/number sign-in routes.
- Random student selection.
- Attendance statistics dashboards.
- Teaching Mode UI work.
- OCR, RAG, model, scoring, or training dependencies.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.attendance-session-records.path.yaml`
- `contracts/sql/teaching-archive.sql`

Go service:

- Domain: attendance record status, normalization, sign-time rule, active-session guard, and principal authorization.
- Use case: `CreateAttendanceRecord`.
- HTTP adapter: attendance session records subresource route.
- PostgreSQL adapter: active-session lookup and idempotent record insert with atomic session counter update.

## Acceptance Criteria

- Domain tests prove status normalization, student/note trimming, sign-time behavior, creator capture, and `att_rec_` id validation.
- Domain tests reject unsupported status, missing student id, ended sessions, cross-student sign-in, and unauthorized principals.
- Use-case tests prove the session is loaded, missing sessions return not found, ended sessions are rejected, new records are persisted, and duplicate intake returns the existing record without claiming a new counter update.
- HTTP tests prove `POST /v1/teaching/attendance-sessions/{sessionId}/records` returns `201` for a new record with normalized response metadata.
- PostgreSQL adapter tests prove the insert uses `teaching_attendance_records`, enforces one row per `(session_id, student_id)`, and updates counters in the same SQL statement only when an insert occurs.
- Structure verification requires SDD 0051, the split OpenAPI path, and new attendance record domain/use-case/HTTP/PostgreSQL files and tests.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0051, remove the OpenAPI path ref and split path file, remove `teaching_attendance_records` SQL/schema setup, remove attendance record domain/use-case/HTTP/PostgreSQL files and tests, remove runtime wiring, and remove structure verifier entries. SDD 0049 attendance session intake remains intact.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
