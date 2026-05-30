# P4 Student App Teaching Materials List

## Slice

- SDD: `docs/sdd/0060-student-app-teaching-materials-list.md`
- Root requirement anchor: Student App includes account login, AI tutor, student archive, teaching materials, personalized question bank, and scan-to-answer.
- Existing refactor evidence: Teaching Archive already owns archive material intake/query and Student App scan-answer entry.

## Contract

- Added `GET /v1/student-app/teaching-materials`.
- Requires Agent API key plus Principal Context.
- Requires a Student App principal with `TEACHING_READ` and own-student access mode.
- Returns only teaching-owned `TEACHING_MATERIAL` archive metadata.
- Reuses existing archive list response and pagination shape.

## Red Evidence

`npm run verify:structure` failed before implementation with the expected missing files:

- `contracts/openapi/teaching-archive.student-app-teaching-materials.path.yaml`
- `services/teaching-archive-gateway/internal/domain/student_app_teaching_materials.go`
- `services/teaching-archive-gateway/internal/usecase/list_student_app_teaching_materials.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_teaching_materials.go`

`go test ./services/teaching-archive-gateway/...` failed before implementation on undefined Student App teaching-material symbols:

- `domain.NormalizeListStudentAppTeachingMaterialsInput`
- `domain.ListStudentAppTeachingMaterialsInput`
- `usecase.NewListStudentAppTeachingMaterials`
- `httpapi.ServerConfig.ListStudentAppTeachingMaterials`

## Green Evidence

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS, 102.1s
- `npm run quality`: PASS, 140.6s
- `services/agent-harness/target` cleanup check: `False`

Latest `reports/quality-gate.current.json`:

- allPassed: `true`
- elapsedMs: `139090`
- npm test: PASS, 70295ms
- go vet: PASS, 64590ms
- cargo test: PASS, 762ms
- identity session runtime audit: PASS
- identity access contract audit: PASS
- direct-limited connection budget: PASS
- pgbouncer connection budget: PASS

## Design Notes

- This is a Student App contract, not a new storage model.
- The endpoint fixes `OwnerType=TEACHING` and `MaterialType=TEACHING_MATERIAL` in the domain boundary.
- Teacher desktop, remote social, service, and missing-`TEACHING_READ` principals are rejected before repository access.
- PostgreSQL uses the existing archive `List` query; no new table, index, migration, or persistence method was added.
- No package manifest changed.
- No OCR/RAG/model/training dependency was added.
