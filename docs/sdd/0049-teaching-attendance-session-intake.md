# SDD 0049: Teaching Attendance Session Intake

## Problem

The root requirements keep Teaching Mode intelligent rollcall as an existing capability that must survive the refactor. The legacy project already has rollcall sessions, records, and student attendance counters, but the refactor-owned Teaching Mode contracts currently cover archive materials, tutoring handoff, quiz submissions, and AI grading only.

Without a Go-owned attendance session intake boundary, the future desktop teaching UI and student sign-in flow would need to keep depending on the legacy Python route shape. That would leave attendance outside the shared Principal Context, strict PostgreSQL connection budgeting, and SDD/TDD quality gates.

## Source Requirement References

- Root requirement: Teaching Mode includes intelligent rollcall, with UI rebuilt but function preserved.
- Root requirement: archive materials and student profiles feed later tutoring and learning analysis.
- Legacy evidence: `backend/app/models/student.py` defines `RollcallSession` and `RollcallRecord`.
- Legacy evidence: `backend/app/services/rollcall_service.py` creates rollcall sessions and records attendance.
- Whole-system map: Teaching Mode owns quiz, AI grading, attendance, resources, tutoring, whiteboard, and archives.

## Scope

In scope:

- Add `POST /v1/teaching/attendance-sessions`.
- Accept metadata-only attendance session intake:
  - `sessionType`: `RANDOM`, `QRCODE`, `GESTURE`, or `NUMBER`.
  - optional `className`.
  - optional `expectedStudentCount`.
  - optional `configRef` for QR/gesture/number configuration artifacts.
- Require an authenticated Principal Context with `TEACHING_WRITE`.
- Create `att_sess_` attendance session ids.
- Persist session metadata and zeroed attendance counters in PostgreSQL.
- Return created session metadata for desktop UI state.
- Keep student sign-in records, random selection, statistics, AI analysis, UI, and student app out of this slice.

Out of scope:

- Attendance record intake.
- Batch attendance import.
- Weighted random student selection.
- Student attendance counters.
- QR code or gesture generation.
- AI analysis of attendance.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.attendance-sessions.path.yaml`
- `contracts/sql/teaching-archive.sql`

Go service:

- Domain: attendance session type, status, metadata normalization, and authorization.
- Use case: `CreateAttendanceSession`.
- HTTP adapter: attendance session intake route.
- PostgreSQL adapter: insert attendance session metadata.

## Acceptance Criteria

- Domain tests prove attendance sessions normalize type, class name, config ref, expected count, creator, and timestamps.
- Domain tests reject unsupported session types and non-teacher/student principals without teaching write scope.
- Use-case tests prove a created session is persisted with zeroed present, absent, and late counts.
- HTTP tests prove `POST /v1/teaching/attendance-sessions` returns `201` with session metadata.
- PostgreSQL adapter tests prove metadata-only insert into `teaching_attendance_sessions`.
- Structure verification requires SDD 0049, the split OpenAPI path, and new attendance use-case files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0049, remove the OpenAPI path ref and split path file, remove `teaching_attendance_sessions` SQL/schema setup, remove attendance domain/use-case/HTTP/PostgreSQL files and tests, and remove structure verifier entries. Existing archive, tutoring, quiz, and AI grading behavior remains intact.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
