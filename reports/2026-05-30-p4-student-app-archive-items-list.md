# P4 Student App Archive Items List

## Slice

- SDD: `docs/sdd/0062-student-app-archive-items-list.md`
- Root requirement anchor: Student App includes account login, AI tutor, student archive, teaching materials, personalized question bank, and scan-to-answer.
- Existing refactor evidence: Teaching Archive already owns archive metadata list pagination and principal-scoped student archive reads.

## Contract

- Added `GET /v1/student-app/archive-items`.
- Requires Agent API key plus Principal Context.
- Requires a Student App principal with `STUDENT_OWN_READ` and own-student access mode.
- Accepts optional `materialType`, `pageSize`, and `cursor`.
- Forces `ownerType=STUDENT` and `studentId` to the authenticated student's own ID.
- Allows only student archive material types: `QUIZ`, `PAPER`, `HANDOUT`, and `HOMEWORK`.
- Reuses existing `ArchiveItemListResponse`.

## Red Evidence

`npm run verify:structure` failed before implementation with the expected missing files:

- `services/teaching-archive-gateway/internal/domain/student_app_archive_items.go`
- `services/teaching-archive-gateway/internal/usecase/list_student_app_archive_items.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items.go`

`go test ./services/teaching-archive-gateway/...` failed before implementation on undefined Student App archive-list symbols:

- `domain.NormalizeListStudentAppArchiveItemsInput`
- `domain.ListStudentAppArchiveItemsInput`
- `usecase.NewListStudentAppArchiveItems`
- `httpapi.ServerConfig.ListStudentAppArchiveItems`

## Green Evidence

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS, 39.4s
- `npm run quality`: PASS, 47.3s
- `services/agent-harness/target` cleanup check: `False`

Latest `reports/quality-gate.current.json`:

- allPassed: `true`
- elapsedMs: `44942`
- npm test: PASS, 39092ms
- go vet: PASS, 1647ms
- cargo test: PASS, 750ms
- identity session runtime audit: PASS
- identity access contract audit: PASS
- direct-limited connection budget: PASS
- pgbouncer connection budget: PASS

## Design Notes

- This is a Student App contract, not a new storage model.
- The endpoint hides desktop archive filters from mobile clients and derives the student scope from Principal Context.
- Teacher desktop, remote social, service, missing-`STUDENT_OWN_READ`, and `TEACHING_MATERIAL` filters are rejected before repository access.
- PostgreSQL uses the existing archive `List` query; no new table, index, migration, or persistence method was added.
- No package manifest changed.
- No OCR/RAG/model/training dependency was added.
