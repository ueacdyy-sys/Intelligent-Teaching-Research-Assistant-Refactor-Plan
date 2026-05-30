# P3 Teaching Attendance Session Intake

## Scope

- Added metadata-only Teaching Mode attendance session intake.
- Added `POST /v1/teaching/attendance-sessions` for intelligent rollcall session creation.
- Added a split OpenAPI path file for attendance sessions and wired it into `teaching-archive.yaml`.
- Added `teaching_attendance_sessions` SQL contract and runtime schema setup.
- Added domain normalization and authorization for attendance session type, class name, expected student count, config ref, creator, status, and timestamps.
- Added a `CreateAttendanceSession` use case and PostgreSQL repository insert.
- Wired the Teaching Archive HTTP gateway and runtime composition root with `att_sess_` ids.

Out of scope stayed out of the slice: attendance records/sign-in, random student selection, weighted rollcall, QR/gesture/number generation, statistics, AI analysis, UI, student app flow, SDK generation, OCR, RAG, model calls, and training dependencies.

## Red Evidence

Before production implementation:

- `npm run verify:structure` failed because `services/teaching-archive-gateway/internal/usecase/create_attendance_session.go` was missing.
- `go test ./services/teaching-archive-gateway/...` failed with missing attendance domain, use case, repository, HTTP adapter, and server constructor/test-helper surface.

## Green Evidence

- `npm run verify:structure` passed.
- `go test ./services/teaching-archive-gateway/...` passed.
- `npm test` passed.
- `npm run quality` passed.

`reports/quality-gate.current.json` records all strict gate commands passing:

- `npm test` in 69760ms.
- `go vet` in 64551ms.
- `cargo test` in 993ms.
- identity session runtime audit in 829ms.
- identity access contract audit in 781ms.
- direct-limited connection budget in 642ms.
- PgBouncer connection budget in 688ms.

## Architecture Notes

- SDD first: `docs/sdd/0049-teaching-attendance-session-intake.md`.
- Contract first: OpenAPI and SQL describe the attendance intake boundary before adapter behavior.
- Clean Architecture boundary: domain owns validation and authorization; the use case owns orchestration; HTTP and PostgreSQL stay as outer adapters.
- The slice stays inside `teaching-archive-gateway` to avoid growing the service and PostgreSQL connection budget for a metadata-only intake endpoint.
- The HTTP boundary keeps strict JSON unknown-field rejection through the shared decoder.
- The PostgreSQL insert stores metadata and zeroed counters only, leaving attendance records for a later SDD slice.
- Dependency manifests were not changed, so no OCR/RAG/model/training dependency was added.

## Files

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.attendance-sessions.path.yaml`
- `contracts/sql/teaching-archive.sql`
- `docs/sdd/0049-teaching-attendance-session-intake.md`
- `services/teaching-archive-gateway/cmd/gateway/main.go`
- `services/teaching-archive-gateway/internal/domain/attendance_session.go`
- `services/teaching-archive-gateway/internal/usecase/create_attendance_session.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_session.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_session.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go`
- `services/teaching-archive-gateway/internal/platform/runtime.go`
- `tools/verify-structure.mjs`
