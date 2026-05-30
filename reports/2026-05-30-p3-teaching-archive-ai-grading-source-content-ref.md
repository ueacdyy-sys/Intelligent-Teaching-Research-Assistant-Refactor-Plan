# P3 Teaching Archive AI Grading Source Content Ref

## Scope

- Added metadata-only `sourceArchiveContentRef` to AI grading requests.
- Create/list responses now expose the source archive artifact reference.
- Worker claim responses now include the same artifact reference for job handoff.
- PostgreSQL stores, selects, returns, and backfills `source_archive_content_ref`.
- Existing AI grading queue, claim, and result state transitions remain unchanged.

Out of scope stayed out of the slice: source file reading, OCR, handwriting recognition, model calls, rubric execution, RAG, training dependencies, worker implementation, and TypeScript SDK generation.

## Red Evidence

Before production implementation:

- `npm run verify:structure` passed after adding SDD 0047 and structure requirements.
- `go test ./services/teaching-archive-gateway/...` failed with missing production fields, including `unknown field SourceArchiveContentRef in struct literal of type domain.CreateAIGradingRequestInput`, `request.SourceArchiveContentRef undefined`, and `unknown field SourceArchiveContentRef in struct literal of type domain.AIGradingRequest`.

## Green Evidence

- `go test ./services/teaching-archive-gateway/...` passed.
- `npm run verify:structure` passed.
- `npm test` passed.
- `npm run quality` passed.

`reports/quality-gate.current.json` records all strict gate commands passing:

- `npm test`
- `go vet`
- `cargo test`
- identity session runtime audit
- identity access contract audit
- direct-limited connection budget
- PgBouncer connection budget

## Architecture Notes

- SDD first: `docs/sdd/0047-teaching-archive-ai-grading-source-content-ref.md`.
- Contract first: OpenAPI response contracts require `sourceArchiveContentRef` for request views and worker claims.
- Clean Architecture boundary: the use case copies `ArchiveItem.ContentRef`; the domain validates and normalizes it; HTTP/PostgreSQL only map the field at the edge.
- PostgreSQL migration is upgrade-safe: add nullable column, backfill from `teaching_archive_items.content_ref`, then set `NOT NULL`.
- Dependency manifests were not changed, so no OCR/RAG/model/training dependency was added.

## Files

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.ai-grading-worker-claims.path.yaml`
- `contracts/sql/teaching-archive.sql`
- `docs/sdd/0047-teaching-archive-ai-grading-source-content-ref.md`
- `services/teaching-archive-gateway/internal/domain/ai_grading_request.go`
- `services/teaching-archive-gateway/internal/usecase/create_ai_grading_request.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_request.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_query.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_claim.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_result.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go`
- `tools/verify-structure.mjs`
