# P3 Teaching Attendance Session End

## Slice

- SDD: `docs/sdd/0056-teaching-attendance-session-end.md`
- Root requirement anchor: Teaching Mode intelligent rollcall keeps existing function while UI is rebuilt; Student App scan flows must respect active/ended session state.
- Existing refactor evidence: attendance sessions already model `ACTIVE`, `ENDED`, and `endedAt`; manual records and student sign-ins already reject ended sessions.

## Contract

- Added `POST /v1/teaching/attendance-sessions/{sessionId}/end`.
- Requires Agent API key plus Principal Context.
- Requires a desktop teacher/admin-style principal with `TEACHING_WRITE`.
- Returns the existing attendance session response shape with `status=ENDED` and `endedAt`.
- Already-ended sessions are idempotent and return `200`.

## Red Evidence

`npm run verify:structure` failed before implementation with the expected missing files:

- `contracts/openapi/teaching-archive.attendance-session-end.path.yaml`
- `services/teaching-archive-gateway/internal/domain/attendance_session_end.go`
- `services/teaching-archive-gateway/internal/usecase/end_attendance_session.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_session_end.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_session_end.go`

`go test ./services/teaching-archive-gateway/...` failed before implementation on undefined end-session symbols:

- `domain.EndAttendanceSession`
- `domain.EndAttendanceSessionInput`
- `domain.AuthorizeEndAttendanceSession`
- `usecase.NewEndAttendanceSession`
- `repository.EndAttendanceSession`

## Green Evidence

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS
- `npm run quality`: PASS

Latest `reports/quality-gate.current.json`:

- allPassed: `true`
- npm test: PASS, 103084ms
- go vet: PASS, 64862ms
- cargo test: PASS, 799ms
- identity session runtime audit: PASS
- identity access contract audit: PASS
- direct-limited connection budget: PASS
- pgbouncer connection budget: PASS

## Design Notes

- The HTTP adapter only routes `POST /end`, parses principal context, and presents the existing attendance session response.
- The use case normalizes and authorizes before repository access, so unauthorized student/service principals do not touch persistence.
- The PostgreSQL adapter uses one CTE query to atomically update only `teaching_attendance_sessions`, requires `status = 'ACTIVE'`, returns already-ended sessions idempotently, and never mutates `teaching_attendance_records`.
- No OCR/RAG/model/training dependency was added.
- No package manifest changed.
