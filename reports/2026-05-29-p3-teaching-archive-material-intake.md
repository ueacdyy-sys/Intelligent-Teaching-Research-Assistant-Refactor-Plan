# P3 Teaching Archive Material Intake

## Summary

Implemented SDD 0029 as the first Teaching Mode slice:

- `POST /v1/teaching/archive-items`
- OpenAPI contract: `contracts/openapi/teaching-archive.yaml`
- SQL metadata contract: `contracts/sql/teaching-archive.sql`
- Go service: `services/teaching-archive-gateway`

The slice creates archive metadata for student learning materials and teaching materials. It reserves OCR status for AI grading but does not install OCR/model dependencies, upload files, read file content, or route legacy traffic.

## Root Requirement Alignment

Covered root requirements:

- Teaching Mode archive materials replace the old screenshot function.
- Student archives include quizzes, papers, handouts, homework, and other learning materials.
- Teaching materials are stored as archive materials.
- Archive materials can later feed tutoring analysis.
- AI grading keeps OCR/handwriting recognition as a reserved future capability.

## TDD Evidence

Red evidence before implementation:

- `go test ./services/teaching-archive-gateway/...` first failed because the new Go module was not yet in `go.work`.
- After adding `go.work`, the same command failed because `internal/domain` and use-case implementation did not exist.

Green evidence after implementation:

- `go test ./services/teaching-archive-gateway/...` passed.
- `npm test` passed.
- `npm run quality` passed.

## Quality Gate Evidence

Latest strict quality report:

- Report: `reports/quality-gate.current.json`
- `allPassed=true`
- `elapsedMs=170547`
- static findings: `[]`

Command gates:

- `npm test`: PASS
- `go vet`: PASS
- `cargo test`: PASS
- identity session runtime audit: PASS
- identity access contract audit: PASS
- direct-limited connection budget: PASS
- PgBouncer connection budget: PASS

## Connection Budget Update

The new Teaching Archive Gateway is counted in connection budgets.

Direct-limited profile:

- legacy backend workers capped at `20`
- Conversation Gateway: `8`
- Identity Gateway: `8`
- Teaching Archive Gateway: `8`
- planned connections: `64`
- safe limit: `65`

PgBouncer profile:

- legacy backend workers: `24`
- Conversation Gateway: `16`
- Identity Gateway: `16`
- Teaching Archive Gateway: `16`
- planned connections: `96`
- safe limit: `190`

## Boundaries

Kept:

- domain/usecase layers have no HTTP or PostgreSQL imports.
- `studentId` and `tags` are validated to match the OpenAPI bounds.
- raw file storage is not implemented.
- OCR/model/training dependencies are not installed.
- PostgreSQL stores only archive metadata.
- local secrets remain `ueacd`.

Follow-up candidates:

- Identity principal authorization for `TEACHING_WRITE` and `STUDENT_ARCHIVE_WRITE`.
- Archive item read/list endpoints with pagination.
- Tutoring job intake contract that references archive item IDs.
- AI grading job contract that can consume OCR status without coupling OCR into the gateway.
