# SDD 0056: Teaching Attendance Session End

## Problem

The root requirements keep Teaching Mode intelligent rollcall as an existing capability whose UI can be rebuilt while the function remains. SDD 0049 through SDD 0055 cover session creation, record intake/query, student history, statistics, and student sign-in. The rebuilt point-call lifecycle still lacks an explicit teacher/admin operation to end an active session.

The current domain already models `ACTIVE`, `ENDED`, and `endedAt`, and both record intake and student sign-in reject ended sessions. Without a contract-owned session end path, the desktop teaching UI cannot close a rollcall session without reaching around the gateway or relying on stale legacy behavior.

## Source Requirement References

- Root requirement: Teaching Mode includes intelligent rollcall, with UI rebuilt but function preserved.
- Root requirement: Student App includes scan answer as a future surface that must respect active/ended session state.
- Legacy evidence: sign-in paths treat a session with `ended_at` as closed.
- SDD 0049: attendance sessions carry `ACTIVE`/`ENDED` lifecycle metadata.
- SDD 0051 and SDD 0055: attendance writes must reject ended sessions.

## Scope

In scope:

- Add `POST /v1/teaching/attendance-sessions/{sessionId}/end`.
- Require a valid Agent API key and Principal Context.
- Require a desktop teacher/admin-style principal with `TEACHING_WRITE`.
- Normalize and validate `sessionId` with the existing `att_sess_` prefix rule.
- End an `ACTIVE` session by setting `status=ENDED` and `endedAt` to server time.
- Return the attendance session response shape with `200`.
- Treat an already-ended session idempotently by returning the existing ended session with `200`.
- Keep the state change atomic in PostgreSQL so concurrent sign-ins and manual records cannot observe a half-ended session.

Out of scope:

- Updating attendance counters.
- Teacher correction/update endpoints.
- Batch ending sessions.
- Random weighted rollcall selection.
- Teaching Mode or Student App UI changes.
- OCR, RAG, model, scoring, or training dependencies.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.attendance-session-end.path.yaml`

Go service:

- Domain: end-session input normalization, teacher/admin authorization, and active-to-ended state transition.
- Use case: `EndAttendanceSession`.
- HTTP adapter: `POST /v1/teaching/attendance-sessions/{sessionId}/end`.
- PostgreSQL adapter: atomic active-session update and idempotent ended-session return.

## Acceptance Criteria

- Domain tests prove active sessions end with UTC `endedAt`, already-ended sessions are idempotent, bad ids fail validation, students are rejected, and desktop teacher/admin principals are allowed.
- Use-case tests prove unauthorized requests fail before repository access, missing sessions return `404`, active sessions end, and already-ended sessions return without conflict.
- HTTP tests prove the end endpoint returns the attendance session response shape with `status=ENDED`, rejects unsupported methods with `405`, and uses existing authentication/principal handling.
- PostgreSQL adapter tests prove the query updates only `teaching_attendance_sessions`, requires `status = 'ACTIVE'`, sets `ended_at`, returns already-ended sessions idempotently, and does not mutate attendance records.
- Structure verification requires SDD 0056 and the new contract/domain/use-case/HTTP/PostgreSQL files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0056, remove the OpenAPI path reference and path file, remove end-session domain/use-case/HTTP/PostgreSQL files and tests, remove route dispatch and server wiring, and remove structure verifier entries. SDD 0049 through SDD 0055 remain intact.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
