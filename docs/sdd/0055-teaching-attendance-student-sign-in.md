# SDD 0055: Teaching Attendance Student Sign-In

## Problem

The root requirements keep Teaching Mode intelligent rollcall as an existing capability whose UI can be rebuilt while the function remains. They also identify the Student App as the next product surface with scan answer and sign-in flows. SDD 0049 through SDD 0054 cover teacher-created attendance sessions, teacher/manual record intake, record query views, student history, and aggregate statistics. The rebuilt student-facing flow still needs a contract-safe sign-in path that lets a student mark themselves present from a QR, gesture, or number session.

The legacy system exposes `POST /rollcall/signin`. It accepts a session id, student identity payload, method metadata, optional timestamp, and returns the attendance record. The refactor must not trust a client-supplied student id for the new path. Student identity must come from Principal Context, and the write must reuse the existing metadata-only, idempotent attendance record path so duplicate scans do not double-count attendance.

## Source Requirement References

- Root requirement: Teaching Mode includes intelligent rollcall, with UI rebuilt but function preserved.
- Root requirement: Student App includes account login, AI tutor, student archive, teaching material, personalized question bank, and scan answer.
- Legacy evidence: `backend/app/api/endpoints/students.py` exposes `/rollcall/signin`.
- Legacy evidence: `RollcallSignInRequest` carries `session_id`, `student_name`, `student_id`, `method`, `code`, `gesture`, and `timestamp`.
- Legacy evidence: legacy sign-in rejects expired QR timestamps, requires an active rollcall session, creates or returns one attendance record, and records `present`.
- SDD 0051: attendance record intake is already idempotent on `(session_id, student_id)` and atomically updates session counters.

## Scope

In scope:

- Add `POST /v1/teaching/attendance-sessions/{sessionId}/sign-ins`.
- Accept student sign-in metadata:
  - `method`: `QR`, `GESTURE`, or `NUMBER` with legacy `qr`/`qrcode` normalization.
  - `timestampMillis`: optional legacy QR timestamp, valid only within 60 seconds of server time.
  - `code`: optional bounded sign-in code metadata.
  - `gesture`: optional bounded gesture metadata.
- Derive `studentId` from Principal Context student own access, not from the request body.
- Require authenticated Principal Context for a student app principal with `STUDENT_OWN_WRITE`.
- Require the target attendance session to be active.
- Require sign-in method to match the attendance session type:
  - `QR` signs into `QRCODE` sessions.
  - `GESTURE` signs into `GESTURE` sessions.
  - `NUMBER` signs into `NUMBER` sessions.
- Create a `PRESENT` attendance record through the existing idempotent attendance record repository.
- Return `201` when a record is created and `200` when a duplicate sign-in returns the existing record.

Out of scope:

- Student roster/master-data creation.
- Persisting raw QR code, number code, or gesture traces.
- Teacher correction/update endpoint.
- Random weighted rollcall selection.
- Session end endpoint.
- Teaching Mode or Student App UI changes.
- OCR, RAG, model, scoring, or training dependencies.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.attendance-session-sign-ins.path.yaml`

Go service:

- Domain: sign-in input normalization, timestamp validation, student principal authorization, session-method compatibility, and `PRESENT` record construction.
- Use case: `SignInAttendance`.
- HTTP adapter: `POST /v1/teaching/attendance-sessions/{sessionId}/sign-ins`.
- PostgreSQL adapter: reuse the existing active-session, idempotent `CreateAttendanceRecord` write path; no new schema or query path is required.

## Acceptance Criteria

- Domain tests prove method normalization, student-id derivation from Principal Context, QR timestamp expiry rejection, session-method mismatch rejection, ended-session rejection, and teacher/cross-role rejection.
- Use-case tests prove unauthorized sign-ins fail before repository access and valid sign-ins create or return the idempotent attendance record result.
- HTTP tests prove the student sign-in endpoint returns the existing attendance record response shape with `201` for a new sign-in and `200` for a duplicate.
- Structure verification requires SDD 0055 and the new sign-in contract/domain/use-case/HTTP files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0055, remove the OpenAPI path reference and path file, remove attendance sign-in domain/use-case/HTTP files and tests, remove route dispatch and server wiring, and remove structure verifier entries. SDD 0049 through SDD 0054 remain intact.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
