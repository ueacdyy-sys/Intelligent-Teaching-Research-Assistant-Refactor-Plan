# P3 Teaching Attendance Random Selection

## Slice

- SDD: `docs/sdd/0057-teaching-attendance-random-selection.md`
- Root requirement anchor: Teaching Mode intelligent rollcall keeps existing function while UI is rebuilt.
- Legacy evidence: the old system exposed `POST /rollcall/random` with weighted random selection, optional present-student exclusion, and class-scoped candidate filtering.

## Contract

- Added `POST /v1/teaching/attendance-sessions/{sessionId}/random-selections`.
- Requires Agent API key plus Principal Context.
- Requires a desktop teacher/admin principal with `TEACHING_WRITE`.
- Accepts a bounded candidate snapshot from the desktop/upstream student read model.
- Defaults to `count=1`, `excludePresent=true`, and `weighted=true`.
- Returns requested count, eligible count, applied flags, and selected students with weight/probability metadata.

## Red Evidence

`npm run verify:structure` failed before implementation with the expected missing files:

- `contracts/openapi/teaching-archive.attendance-session-random-selections.path.yaml`
- `services/teaching-archive-gateway/internal/domain/attendance_random_selection.go`
- `services/teaching-archive-gateway/internal/usecase/select_attendance_random_students.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_random_selection.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_random_selection.go`

`go test ./services/teaching-archive-gateway/...` failed before implementation on undefined random-selection symbols:

- `domain.SelectAttendanceRandomStudents`
- `domain.AttendanceRandomSelectionInput`
- `domain.AttendanceSelectionCandidate`
- `domain.AuthorizeAttendanceRandomSelection`
- `usecase.NewSelectAttendanceRandomStudents`
- `repository.ListAttendancePresentStudentIDs`

## Green Evidence

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS
- `npm run quality`: PASS

Latest `reports/quality-gate.current.json`:

- allPassed: `true`
- npm test: PASS, 102934ms
- go vet: PASS, 64522ms
- cargo test: PASS, 737ms
- identity session runtime audit: PASS
- identity access contract audit: PASS
- direct-limited connection budget: PASS
- pgbouncer connection budget: PASS

## Design Notes

- The weighted algorithm stays in the domain layer and mirrors legacy weights: low attendance ratio increases selection weight, then multiplies by `rollcallWeight`.
- The use case authorizes before repository access, loads only active attendance sessions, and reads present student IDs only when exclusion is enabled.
- The HTTP adapter only parses the request, preserves existing auth/error semantics, and delegates selection to the use case.
- The PostgreSQL adapter performs a read-only parameterized query against current-session `PRESENT` records.
- No OCR/RAG/model/training dependency was added.
- No package manifest changed.
