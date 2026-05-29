# P3 Teaching Archive HTTP Runtime Headroom Split

## Slice

- SDD: `docs/sdd/0042-teaching-archive-http-runtime-headroom-split.md`
- Scope: behavior-preserving Teaching Archive HTTP adapter runtime split.
- Goal: keep endpoint orchestration reviewable before adding more Teaching Mode HTTP behavior.

## Requirement Trace

- Root requirement: Teaching Mode includes AI grading, tutoring mode, student archives, teaching materials, and personalized learning support.
- Root requirement: AI grading reserves OCR or handwriting recognition for precise scoring while the baseline runtime remains metadata-only.
- Whole-system map: modules are delivery slices under the full product boundary.
- SDD 0014: strict quality gate rejects oversized files and architecture boundary drift.
- SDD 0041: quality headroom split established explicit file-size headroom before new feature work.

## Red Evidence

After adding SDD 0042 structure requirements and before the split, `npm run verify:structure` failed as expected:

- Missing `services/teaching-archive-gateway/internal/adapter/httpapi/server_requests.go`.
- Missing `services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go`.
- Missing `services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go`.
- Missing `services/teaching-archive-gateway/internal/adapter/httpapi/server_codec.go`.
- Missing `services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go`.

Pre-split line counts:

- `services/teaching-archive-gateway/internal/adapter/httpapi/server.go`: 740 lines.
- `services/teaching-archive-gateway/internal/adapter/postgres/repository.go`: 769 lines.
- `tools/verify-structure.mjs`: 600 lines.
- `contracts/openapi/teaching-archive.yaml`: 677 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_test.go`: 414 lines.

## Implementation

- Added SDD 0042 for HTTP runtime headroom.
- Added structure verifier requirements for the new HTTP adapter split files.
- Added a `server.go <= 500` headroom gate.
- Moved HTTP request DTOs into `server_requests.go`.
- Moved HTTP response DTOs into `server_responses.go`.
- Moved route path parsing into `server_paths.go`.
- Moved API-key authorization, principal decoding, JSON decoding, integer parsing, archive error mapping, and JSON/error writing into `server_codec.go`.
- Moved domain-to-HTTP presenter functions into `server_presenters.go`.
- Moved AI grading list and worker-claim response DTO/presenter helpers into the shared response/presenter files.
- Kept route paths, use-case calls, JSON field names, status codes, authorization behavior, and error semantics unchanged.

Post-split line counts:

- `services/teaching-archive-gateway/internal/adapter/httpapi/server.go`: 350 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_requests.go`: 45 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go`: 115 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go`: 50 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_codec.go`: 102 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go`: 163 lines.

## Verification

- `npm run verify:structure`: PASS
- `go test ./services/teaching-archive-gateway/internal/adapter/httpapi`: PASS
- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm test`: PASS
- `npm run quality`: PASS

## Performance And Dependency Notes

- This slice does not change runtime behavior, SQL, connection pools, or database access patterns.
- It improves development throughput by separating endpoint orchestration from DTOs, path parsing, codec/error logic, and presenters.
- No OCR, RAG, model, training, scoring, or Python worker dependency was added.

## Rollback

Move request DTOs, response DTOs, path parsing, codec helpers, and presenter helpers back into `server.go`, restore AI grading helper placement in the AI grading files, remove SDD 0042 checks from `tools/verify-structure.mjs`, and delete the split files and this report.
