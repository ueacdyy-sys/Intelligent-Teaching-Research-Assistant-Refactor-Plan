# P3 Teaching Attendance Record Query View

Date: 2026-05-30

## Scope

SDD 0052 adds the metadata-only record query slice for Teaching Mode intelligent rollcall:

- `GET /v1/teaching/attendance-sessions/{sessionId}/records`.
- paginated attendance record metadata for a single `att_sess_` session.
- optional `studentId`, `pageSize`, and `cursor` query parameters.
- stable sort by `created_at DESC, id DESC`.
- Principal Context scoping for student-own and assigned/all student access.
- PostgreSQL tuple cursor and bounded `pageSize + 1` fetch.

Out of scope stayed out of the slice: statistics dashboards, teacher correction/update, QR/gesture/number sign-in payload routes, Teaching Mode UI work, SDK generation, OCR, RAG, model calls, scoring, and training dependencies.

## Root Evidence

- Root requirements: intelligent rollcall keeps the existing function while the UI is rebuilt.
- Legacy service: `backend/app/services/rollcall_service.py` has `get_session_records(session_id)`.
- Legacy API: `backend/app/api/endpoints/students.py` exposes `/rollcall/sessions/{session_id}/records`.
- SDD 0051 delivered record intake but intentionally left record query views for a later slice.

## Red Evidence

Structure gate before implementation:

- `npm run verify:structure`
- failed on the intentionally required but missing attendance record query SDD/domain/use-case/HTTP/PostgreSQL files.

Go test before implementation:

- `go test ./services/teaching-archive-gateway/...`
- failed on undefined query contracts and wiring such as `ListAttendanceRecordsInput`, `AttendanceRecordQuery`, `NewListAttendanceRecords`, `ListAttendanceRecords`, and server constructor arguments.

## Implementation

- Added SDD 0052 and the OpenAPI `get` operation for the attendance-session records split path.
- Added domain query normalization, cursor encoding/decoding, Principal Context scoping, and page construction.
- Added `ListAttendanceRecords` use case.
- Added HTTP `GET` dispatch, query parsing, response page mapping, and runtime wiring.
- Added PostgreSQL list query over `teaching_attendance_records` with session filter, optional student filters, cursor tuple, and bounded limit.
- Added structure verifier entries for the SDD and new query files.
- Added extra quality coverage for assigned-teacher student scoping during final review.

## Verification

Passed:

- `npm run verify:structure`
- `go test ./services/teaching-archive-gateway/...`
- `npm test`
- `npm run quality`

Quality gate summary:

- all checks passed.
- `npm test` passed in 69825 ms.
- `go vet` passed in 64253 ms.
- `cargo test` passed in 800 ms.
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
- attendance statistics read model.
- student attendance history endpoint.
- Teaching Mode UI rebuild against the new contract.
