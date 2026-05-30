# P3 Teaching Attendance Student Sign-In

## Slice

- SDD: `docs/sdd/0055-teaching-attendance-student-sign-in.md`
- Root requirement anchor: Teaching Mode intelligent rollcall keeps existing function while UI is rebuilt; Student App keeps scan answer/sign-in as a product surface.
- Legacy evidence: `POST /rollcall/signin` accepted QR/gesture/number-style metadata, required an active rollcall session, rejected expired timestamps, and created or returned a `present` attendance record.

## Contract

- Added `POST /v1/teaching/attendance-sessions/{sessionId}/sign-ins`.
- Request derives `studentId` from Principal Context own-student access instead of trusting request JSON.
- Method normalization accepts legacy `qr`/`qrcode` and canonical `QR`, `GESTURE`, `NUMBER`.
- Responses reuse the attendance record shape:
  - `201` for a new sign-in.
  - `200` for an idempotent duplicate sign-in.

## Red Evidence

`npm run verify:structure` failed before implementation with the expected missing files:

- `contracts/openapi/teaching-archive.attendance-session-sign-ins.path.yaml`
- `services/teaching-archive-gateway/internal/domain/attendance_sign_in.go`
- `services/teaching-archive-gateway/internal/usecase/sign_in_attendance.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_sign_in.go`

`go test ./services/teaching-archive-gateway/...` failed before implementation on undefined sign-in domain and use-case symbols:

- `domain.NewAttendanceSignInRecord`
- `domain.AttendanceSignInInput`
- `domain.AttendanceSignInMethodQR`
- `usecase.NewSignInAttendance`

## Green Evidence

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS
- `npm run quality`: PASS

Latest `reports/quality-gate.current.json`:

- allPassed: `true`
- npm test: PASS, 70134ms
- go vet: PASS, 64738ms
- cargo test: PASS, 983ms
- identity session runtime audit: PASS
- identity access contract audit: PASS
- direct-limited connection budget: PASS
- pgbouncer connection budget: PASS

## Design Notes

- No OCR/RAG/model/training dependency was added.
- No package manifest changed.
- No new PostgreSQL schema or query path was added; the sign-in use case reuses the existing active-session, idempotent `CreateAttendanceRecord` repository path.
- Student sign-in authorization is stricter than the legacy local-client check: it requires a valid Student App Principal Context with own-student write access.
