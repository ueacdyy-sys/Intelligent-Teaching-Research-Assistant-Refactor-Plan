# P3 Teaching Attendance Record Intake

Date: 2026-05-30

## Scope

SDD 0051 adds the first attendance record intake slice for Teaching Mode intelligent rollcall:

- `POST /v1/teaching/attendance-sessions/{sessionId}/records`
- `att_rec_` record IDs.
- statuses `PRESENT`, `ABSENT`, `LATE`, `LEAVE`, with legacy lowercase normalization.
- `signTime` only for `PRESENT` and `LATE`.
- one record per `(sessionId, studentId)`.
- duplicate active-session intake returns the existing record without incrementing counters again.
- newly inserted records atomically update session counters in PostgreSQL.

## Root Evidence

- Root requirements: intelligent rollcall keeps the existing function while the UI is rebuilt.
- Legacy model: `RollcallRecord` stores session, student, status, sign time, note, and created time.
- Legacy service: present/late records receive sign time and update session counters.
- Legacy sign-in: repeated sign-in returns an existing record instead of double-counting.

## Red Evidence

Structure gate before implementation:

- `npm run verify:structure`
- failed on the intentionally required but missing attendance record domain/use-case/HTTP/PostgreSQL files.

Go test before implementation:

- `go test ./services/teaching-archive-gateway/...`
- failed on undefined `AttendanceRecord`, `CreateAttendanceRecordInput`, `NewCreateAttendanceRecord`, HTTP wiring, and Postgres repository methods.

## Implementation

- Added SDD 0051 and OpenAPI split path.
- Added `teaching_attendance_records` SQL contract and runtime schema.
- Added domain validation, normalization, authorization, active-session guard, and sign-time rule.
- Added `CreateAttendanceRecord` use case.
- Added HTTP subresource route and response mapping.
- Added Postgres active-session lookup.
- Added idempotent insert SQL with:
  - `active_session` row lock.
  - `ON CONFLICT (session_id, student_id) DO NOTHING`.
  - counter update guarded by `EXISTS (SELECT 1 FROM inserted)`.
  - existing-record return for active duplicate intake.
- Added `AttendanceRecordIDGenerator`.

## Verification

Passed:

- `npm run verify:structure`
- `go test ./services/teaching-archive-gateway/...`
- `npm test`
- `npm run quality`

Quality gate summary:

- all checks passed.
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

- attendance record query view.
- dedicated QR/gesture/number sign-in route and payload validation.
- teacher correction/update endpoint.
- attendance statistics read model.
- Teaching Mode UI rebuild against the new contract.
