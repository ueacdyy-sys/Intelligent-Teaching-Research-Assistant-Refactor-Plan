# SDD 0057: Teaching Attendance Random Selection

## Problem

The root requirements keep Teaching Mode intelligent rollcall as an existing capability whose UI can be rebuilt while the function remains. SDD 0049 through SDD 0056 now cover attendance session creation, manual records, queries, student history, statistics, student sign-in, and session ending. The rebuilt intelligent rollcall still lacks the random/weighted student selection that makes the desktop point-call flow more than plain attendance entry.

The legacy system exposes `POST /rollcall/random` and selects students with a weighted algorithm: students with lower attendance participation get higher probability, optional class filtering narrows the candidate set, and already-present students can be excluded. The refactor does not yet own student roster storage, so this slice keeps student master data outside the gateway and accepts a bounded candidate snapshot from the desktop UI or upstream student-profile read model. The gateway still owns the hot algorithm, Principal Context authorization, active-session check, and exclusion of students already present in the target attendance session.

## Source Requirement References

- Root requirement: Teaching Mode includes intelligent rollcall, with UI rebuilt but function preserved.
- Legacy evidence: `backend/app/api/endpoints/students.py` exposes `POST /rollcall/random`.
- Legacy evidence: `RollcallService.weighted_random_select` supports `count`, `exclude_present`, and `class_name`.
- Legacy evidence: `_calculate_student_weight` uses attendance, absence, late counts, and `rollcall_weight`.
- Existing refactor evidence: SDD 0055 and SDD 0056 list random weighted rollcall selection as out of scope.

## Scope

In scope:

- Add `POST /v1/teaching/attendance-sessions/{sessionId}/random-selections`.
- Require a valid Agent API key and Principal Context.
- Require a desktop teacher/admin-style principal with `TEACHING_WRITE`.
- Require the target attendance session to exist and be `ACTIVE`.
- Accept a bounded candidate snapshot:
  - `studentId`
  - optional `displayName`
  - optional `attendanceCount`, `absenceCount`, `lateCount`
  - optional `rollcallWeight`
- Default `count` to `1`.
- Default `excludePresent` to `true`.
- Default `weighted` to `true`.
- Exclude candidates that already have a `PRESENT` record in the target attendance session when `excludePresent=true`.
- Select without replacement, up to `count`, using the legacy-compatible weight formula:
  - no history: base weight `1.0`
  - otherwise: `max(0.1, 2.0 - attendanceCount / total)`
  - final weight: base weight multiplied by `rollcallWeight`
- Return selected student metadata plus computed weight/probability evidence for UI explainability.

Out of scope:

- Creating or updating student master data.
- Persisting random selection history.
- Automatically marking selected students as present/absent.
- QR, gesture, or number-code generation.
- Teaching Mode UI changes.
- OCR, RAG, model, scoring, or training dependencies.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.attendance-session-random-selections.path.yaml`

Go service:

- Domain: candidate normalization, authorization, weighted selection, present-exclusion, and response construction.
- Use case: `SelectAttendanceRandomStudents`.
- HTTP adapter: `POST /v1/teaching/attendance-sessions/{sessionId}/random-selections`.
- PostgreSQL adapter: read present student ids for the target session; no schema change.

## Acceptance Criteria

- Domain tests prove weight calculation, weighted selection without replacement, present-student exclusion, default values, candidate bounds, bad counts, and student/service rejection.
- Use-case tests prove unauthorized requests fail before repository access, missing sessions return `404`, ended sessions return conflict, and valid selections read present ids only when requested.
- HTTP tests prove the endpoint returns a `200` selection response and rejects unsupported methods with `405`.
- PostgreSQL adapter tests prove the present-id query is parameterized, reads only `teaching_attendance_records`, filters by `session_id` and `status='PRESENT'`, and does not mutate tables.
- Structure verification requires SDD 0057 and the new random-selection contract/domain/use-case/PostgreSQL/HTTP files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0057, remove the OpenAPI path reference and path file, remove random-selection domain/use-case/HTTP/PostgreSQL files and tests, remove route dispatch and server wiring, and remove structure verifier entries. SDD 0049 through SDD 0056 remain intact.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
