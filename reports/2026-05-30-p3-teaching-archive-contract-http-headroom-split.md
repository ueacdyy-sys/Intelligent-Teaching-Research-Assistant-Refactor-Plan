# P3 Teaching Archive Contract And HTTP Headroom Split

## Scope

- Added SDD 0050 for a behavior-preserving Teaching Archive contract and HTTP adapter split.
- Split inline archive-item OpenAPI paths out of `contracts/openapi/teaching-archive.yaml`.
- Split HTTP route registration and archive/tutoring endpoint orchestration out of `server.go`.
- Tightened executable headroom gates:
  - `contracts/openapi/teaching-archive.yaml` must stay at or below 620 lines.
  - `services/teaching-archive-gateway/internal/adapter/httpapi/server.go` must stay at or below 140 lines.
- Kept route paths, operation IDs, request/response shapes, status codes, authorization, SQL, runtime behavior, and dependencies unchanged.

Out of scope stayed out of the slice: attendance record intake, random selection, statistics, SQL schema changes, UI, SDK generation, OCR, RAG, model calls, and training dependencies.

## Red Evidence

After adding SDD 0050 structure requirements and before the split, `npm run verify:structure` failed as expected:

- Missing `contracts/openapi/teaching-archive.archive-items.path.yaml`.
- Missing `contracts/openapi/teaching-archive.archive-item-tutoring-analysis-requests.path.yaml`.
- Missing `contracts/openapi/teaching-archive.archive-item-ai-grading-requests.path.yaml`.
- Missing `services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go`.
- Missing `services/teaching-archive-gateway/internal/adapter/httpapi/server_archive_items.go`.
- Missing `services/teaching-archive-gateway/internal/adapter/httpapi/server_tutoring_analysis.go`.

Pre-split line counts:

- `contracts/openapi/teaching-archive.yaml`: 697 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server.go`: 490 lines.

## Green Evidence

- `npm run verify:structure` passed.
- `go test ./services/teaching-archive-gateway/internal/adapter/httpapi` passed.
- `go test ./services/teaching-archive-gateway/...` passed.
- `npm test` passed.
- `npm run quality` passed.

`reports/quality-gate.current.json` records all strict gate commands passing:

- `npm test` in 70277ms.
- `go vet` in 64187ms.
- `cargo test` in 766ms.
- identity session runtime audit in 742ms.
- identity access contract audit in 729ms.
- direct-limited connection budget in 681ms.
- PgBouncer connection budget in 636ms.

Post-split line counts:

- `contracts/openapi/teaching-archive.yaml`: 552 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server.go`: 57 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go`: 104 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_archive_items.go`: 206 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_tutoring_analysis.go`: 135 lines.

## Architecture Notes

- This is a preparatory refactoring slice: it creates reviewable room for the next intelligent rollcall attendance-record feature without changing behavior.
- Contract-first shape is preserved through split path files that reference `teaching-archive.yaml` components.
- Clean Architecture boundaries are unchanged: HTTP adapters still call use cases; domain and use-case layers do not import HTTP or PostgreSQL adapters.
- The next attendance slice can add endpoint behavior without immediately exceeding contract or HTTP runtime headroom.
- Dependency manifests were not changed, so no OCR/RAG/model/training dependency was added.

## Files

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.archive-items.path.yaml`
- `contracts/openapi/teaching-archive.archive-item-tutoring-analysis-requests.path.yaml`
- `contracts/openapi/teaching-archive.archive-item-ai-grading-requests.path.yaml`
- `docs/sdd/0050-teaching-archive-contract-http-headroom-split.md`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_archive_items.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_tutoring_analysis.go`
- `tools/verify-structure.mjs`
