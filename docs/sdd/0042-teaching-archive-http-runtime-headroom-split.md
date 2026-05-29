# SDD 0042: Teaching Archive HTTP Runtime Headroom Split

## Problem

SDD 0041 reduced the largest Teaching Archive contract and HTTP test files, but `services/teaching-archive-gateway/internal/adapter/httpapi/server.go` still has 740 lines. That file now mixes five reasons to change:

- server construction and route registration.
- HTTP request DTOs.
- HTTP response DTOs.
- path parsing and principal/header decoding.
- domain-to-HTTP presentation and JSON/error writing.

Future Teaching Mode slices still need more HTTP behavior for quiz submission, AI grading results, student archive views, and worker handoff. If every endpoint continues to grow `server.go`, the adapter will again hit the quality gate and become harder to review safely.

## Source Requirement References

- Root requirement: Teaching Mode includes AI grading, tutoring mode, student archives, teaching materials, and personalized learning support.
- Root requirement: AI grading keeps existing function while reserving OCR or handwriting recognition for precise scoring.
- Whole-system invariant: modules are delivery slices under the full product boundary.
- SDD 0014: strict quality gate rejects oversized files and enforces clean architecture import boundaries.
- SDD 0041: Teaching Archive quality headroom split established explicit file-size headroom before new feature work.

## Scope

In scope:

- Split request DTOs out of `server.go`.
- Split response DTOs out of `server.go`.
- Split path parsing out of `server.go`.
- Split auth/header decoding, JSON decoding, integer parsing, archive error mapping, and JSON/error writing out of `server.go`.
- Split domain-to-HTTP presenter functions out of `server.go`.
- Add executable structure checks that require the new files and keep `server.go` below the new headroom limit.
- Keep all route paths, status codes, JSON field names, authorization behavior, use-case calls, and error semantics unchanged.

Out of scope:

- New endpoints.
- OpenAPI or SQL behavior changes.
- Database performance changes.
- Python worker implementation.
- OCR, RAG, model, scoring, or training dependencies.
- TypeScript SDK generation.

## Contracts

Updated structure contract:

- `tools/verify-structure.mjs`

Go HTTP adapter organization:

- `services/teaching-archive-gateway/internal/adapter/httpapi/server.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_requests.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_codec.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go`

## Acceptance Criteria

- Structure verification fails before the split because the new HTTP adapter split files are missing and `server.go` exceeds the new 500-line headroom limit.
- `server.go` keeps server construction, route registration, and endpoint orchestration only, and stays at or below 500 lines.
- Request DTOs live in `server_requests.go`.
- Response DTOs live in `server_responses.go`.
- Path parsing lives in `server_paths.go`.
- JSON/auth/error helper logic lives in `server_codec.go`.
- Domain-to-HTTP response mapping lives in `server_presenters.go`.
- Teaching Archive HTTP tests still pass without behavior changes.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Move the request DTOs, response DTOs, path parsing, codec helpers, and presenter helpers back into `server.go`, remove SDD 0042 structure checks from `tools/verify-structure.mjs`, and delete the split files. Because this slice is behavior-preserving, rollback only changes file organization.

## Observability And Performance Evidence

Record:

- failing structure-verifier evidence before the split.
- line counts before and after the split.
- targeted Teaching Archive HTTP/Go test result.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
