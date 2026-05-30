# SDD 0050: Teaching Archive Contract And HTTP Headroom Split

## Problem

SDD 0049 restored the Teaching Mode intelligent rollcall entry point, but it left two Teaching Archive chokepoints nearly full again:

- `contracts/openapi/teaching-archive.yaml`: 697 lines under a 700-line headroom gate.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server.go`: 490 lines under a 500-line headroom gate.

The next rollcall slice needs attendance record intake and likely session-record query behavior. Adding that directly would mix feature work with emergency contract and HTTP adapter surgery. This slice creates headroom first without changing route behavior, JSON shapes, SQL, authorization, dependencies, or runtime semantics.

## Source Requirement References

- Root requirement: Teaching Mode includes intelligent rollcall, with UI rebuilt but function preserved.
- Root requirement: Teaching Mode also includes quiz, AI grading, resources, tutoring, whiteboard, archives, and student profile support.
- Whole-system invariant: modules are delivery slices under the full root product boundary.
- SDD 0014: strict quality gate rejects oversized files and architecture boundary drift.
- SDD 0041 through SDD 0043: Teaching Archive already uses behavior-preserving headroom slices before adding more feature surface.
- SDD 0049: attendance sessions are in place, but records, statistics, random selection, and UI remain future slices.

## Scope

In scope:

- Split existing inline Teaching Archive OpenAPI path objects out of `teaching-archive.yaml`.
- Split Teaching Archive HTTP route registration and archive/tutoring endpoint orchestration out of `server.go`.
- Add executable structure checks requiring the new files.
- Tighten headroom gates so the next attendance record slice has room to land.
- Keep all route paths, operation IDs, request schemas, response schemas, status codes, authorization behavior, and error semantics unchanged.
- Keep `npm test` Docker-free.

Out of scope:

- New API behavior.
- Attendance record intake.
- Random selection.
- Statistics.
- SQL schema changes.
- Database performance changes.
- Python worker implementation.
- OCR, RAG, model, scoring, or training dependencies.
- TypeScript SDK generation.

## Contracts

Updated structure contract:

- `tools/verify-structure.mjs`

New or split OpenAPI files:

- `contracts/openapi/teaching-archive.archive-items.path.yaml`
- `contracts/openapi/teaching-archive.archive-item-tutoring-analysis-requests.path.yaml`
- `contracts/openapi/teaching-archive.archive-item-ai-grading-requests.path.yaml`

Go HTTP adapter organization:

- `services/teaching-archive-gateway/internal/adapter/httpapi/server.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_archive_items.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_tutoring_analysis.go`

## Acceptance Criteria

- Structure verification fails before the split because the new split files are missing and the main OpenAPI/HTTP files exceed the tightened headroom thresholds.
- `teaching-archive.yaml` delegates archive-item create/list and nested archive-item analysis paths to dedicated path files and stays at or below 620 lines.
- `server.go` keeps only server state and construction, and stays at or below 140 lines.
- `server_routes.go` owns `Handler`, health, and subresource route dispatch.
- `server_archive_items.go` owns archive item create/list and nested archive-item endpoint orchestration.
- `server_tutoring_analysis.go` owns tutoring-analysis list/create/claim/result endpoint orchestration.
- Teaching Archive HTTP tests still pass without behavior changes.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Move the split OpenAPI path objects back into `teaching-archive.yaml`, move HTTP route and endpoint functions back into `server.go`, remove SDD 0050 structure checks from `tools/verify-structure.mjs`, and delete the split files. Because this slice is behavior-preserving, rollback only changes file organization.

## Observability And Performance Evidence

Record:

- failing structure-verifier evidence before the split.
- line counts before and after the split.
- targeted Teaching Archive HTTP/Go test result.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
