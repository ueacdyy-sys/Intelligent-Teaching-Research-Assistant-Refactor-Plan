# P3 Teaching Archive Query View

## Summary

Implemented SDD 0030 as the Teaching Archive read-path slice:

- `GET /v1/teaching/archive-items`
- cursor pagination by `createdAt DESC, id DESC`
- optional filters: `ownerType`, `studentId`, `materialType`
- bounded `pageSize`
- metadata-only response shape: `data` and `pageInfo`

This makes SDD 0029 archive metadata usable by teacher/student surfaces without introducing file reads, OCR, RAG, or model dependencies.

## Root Requirement Alignment

Covered root requirements:

- student archive materials can be queried as metadata.
- teaching materials can be queried as metadata.
- later tutoring analysis can reference archive item IDs instead of raw files.
- student app archive and teaching-material screens have a stable read contract to consume later.

## TDD Evidence

Red evidence before implementation:

- `go test ./services/teaching-archive-gateway/...` failed because `usecase.NewListArchiveItems`, `domain.ListArchiveItemsInput`, `domain.ArchiveItemQuery`, and cursor helpers did not exist.
- HTTP tests also failed because `httpapi.NewServer` did not yet accept the list use case.

Green evidence after implementation:

- `go test ./services/teaching-archive-gateway/...` passed.
- `npm test` passed.
- `npm run quality` passed.

## Quality Gate Evidence

Latest strict quality report:

- Report: `reports/quality-gate.current.json`
- `allPassed=true`
- `elapsedMs=139593`
- static findings: `[]`

Command gates:

- `npm test`: PASS
- `go vet`: PASS
- `cargo test`: PASS
- identity session runtime audit: PASS
- identity access contract audit: PASS
- direct-limited connection budget: PASS
- PgBouncer connection budget: PASS

## Boundaries

Kept:

- domain/usecase layers have no HTTP or PostgreSQL imports.
- list pagination is metadata-only.
- SQL reads archive metadata only; no file content is opened.
- OCR/model/training dependencies are not installed.
- endpoint remains behind the local API key until a future Identity-principal SDD wires scoped authorization.
- local secrets remain `ueacd`.

Follow-up candidates:

- principal-aware Teaching Archive authorization for `TEACHING_READ` and `STUDENT_OWN_READ`.
- archive item detail endpoint by ID.
- tutoring job intake that references archive item IDs.
- student-app TypeScript SDK/client once the API shape stabilizes.
