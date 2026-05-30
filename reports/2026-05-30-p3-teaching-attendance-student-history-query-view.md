# P3 Teaching Attendance Student History Query View

Date: 2026-05-30

## Scope

SDD 0053 adds the student attendance history query slice for Teaching Mode intelligent rollcall:

- `GET /v1/teaching/students/{studentId}/attendance-records`.
- paginated attendance record metadata for one student.
- optional `pageSize` and `cursor` query parameters.
- stable sort by `created_at DESC, id DESC`.
- Principal Context scoping for student-own and teacher/admin assigned/all student access.
- PostgreSQL tuple cursor and bounded `pageSize + 1` fetch.

Out of scope stayed out of the slice: session-scoped record query, statistics dashboards, teacher correction/update, QR/gesture/number sign-in payload routes, random student selection, Teaching Mode UI work, SDK generation, OCR, RAG, model calls, scoring, and training dependencies.

## Root Evidence

- Root requirements: intelligent rollcall keeps the existing function while the UI is rebuilt.
- Legacy API: `backend/app/api/endpoints/students.py` exposes `/students/{student_id}/attendance`.
- Legacy service: `RollcallService.get_student_attendance_history(student_id, limit)` returns student attendance history.
- Legacy repository: `RollcallRepository.get_student_records` queries by `student_id` ordered by `created_at DESC`.
- SDD 0052 delivered session-scoped record query but intentionally left student history for a later slice.

## Red Evidence

Structure gate before implementation:

- `npm run verify:structure`
- failed on the intentionally required but missing student attendance history contract/domain/use-case/HTTP/PostgreSQL files.

Go test before implementation:

- `go test ./services/teaching-archive-gateway/...`
- failed on undefined `NormalizeListStudentAttendanceRecordsInput`, `ListStudentAttendanceRecordsInput`, `ScopeListStudentAttendanceRecords`, `StudentAttendanceRecordQuery`, `NewListStudentAttendanceRecords`, repository method `ListStudentAttendanceRecords`, and the new server constructor argument.

Quality gate during implementation:

- `npm run quality`
- initially failed because `tools/verify-structure.mjs` exceeded the 800-line quality headroom after adding SDD 0053 checks.
- fixed by consolidating repeated SDD heading checks into a compact table-driven loop.

## Implementation

- Added SDD 0053 and OpenAPI path split for student attendance records.
- Added domain normalization, Principal Context authorization, cursor reuse, and page construction.
- Added `ListStudentAttendanceRecords` use case.
- Added HTTP student attendance subresource route and response mapping through the existing attendance record page presenter.
- Added PostgreSQL indexed query over `teaching_attendance_records` filtered by `student_id`.
- Added structure verifier entries for the SDD and new contract/domain/use-case/HTTP/PostgreSQL files.
- Reduced `tools/verify-structure.mjs` duplication to keep strict source-size headroom intact.

## Verification

Passed:

- `npm run verify:structure`
- `go test ./services/teaching-archive-gateway/...`
- `npm test`
- `npm run quality`

Quality gate summary:

- all checks passed.
- `npm test` passed in 69827 ms.
- `go vet` passed in 64615 ms.
- `cargo test` passed in 772 ms.
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

- attendance statistics read model.
- dedicated QR/gesture/number sign-in route and payload validation.
- teacher correction/update endpoint.
- random student selection endpoint.
- Teaching Mode UI rebuild against the new contract.
