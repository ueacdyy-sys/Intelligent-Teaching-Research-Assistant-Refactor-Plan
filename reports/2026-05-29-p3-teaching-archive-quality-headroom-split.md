# P3 Teaching Archive Quality Headroom Split

## Slice

- SDD: `docs/sdd/0041-teaching-archive-quality-headroom-split.md`
- Scope: behavior-preserving Teaching Archive contract and HTTP test split.
- Goal: restore quality headroom before the next Teaching Mode feature slice.

## Requirement Trace

- Root requirement: Teaching Mode includes AI grading, tutoring mode, student archives, teaching materials, and personalized learning support.
- Root requirement: archive materials include quizzes, papers, handouts, homework, and teaching materials.
- Whole-system map: modules are delivery slices under the whole-system product boundary.
- SDD 0014: strict quality gate rejects oversized files.

## Red Evidence

After adding SDD 0041 structure requirements and before the split, `npm run verify:structure` failed as expected:

- Missing `contracts/openapi/teaching-archive.tutoring-analysis-requests.path.yaml`.
- Missing `contracts/openapi/teaching-archive.tutoring-analysis-worker-claims.path.yaml`.
- Missing `contracts/openapi/teaching-archive.tutoring-analysis-worker-result.path.yaml`.
- Missing `services/teaching-archive-gateway/internal/adapter/httpapi/server_test_helpers_test.go`.

Pre-split line counts:

- `contracts/openapi/teaching-archive.yaml`: 797 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_test.go`: 799 lines.
- `services/teaching-archive-gateway/internal/adapter/postgres/repository.go`: 769 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server.go`: 740 lines.

## Implementation

- Added SDD 0041 for the quality-headroom slice.
- Added structure verifier requirements for the new split files.
- Added explicit headroom thresholds:
  - `teaching-archive.yaml` must stay at or below 700 lines.
  - `server_test.go` must stay at or below 500 lines.
- Moved tutoring-analysis list, worker-claim, and worker-result OpenAPI path objects into dedicated path files.
- Moved shared HTTP test helpers, fake repository, principals, fixtures, fixed IDs, and fixed clock into `server_test_helpers_test.go`.
- Kept API paths, operation IDs, schemas, status codes, route behavior, authorization behavior, and SQL unchanged.

Post-split line counts:

- `contracts/openapi/teaching-archive.yaml`: 677 lines.
- `contracts/openapi/teaching-archive.tutoring-analysis-requests.path.yaml`: 58 lines.
- `contracts/openapi/teaching-archive.tutoring-analysis-worker-claims.path.yaml`: 28 lines.
- `contracts/openapi/teaching-archive.tutoring-analysis-worker-result.path.yaml`: 37 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_test.go`: 414 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_test_helpers_test.go`: 395 lines.

## Verification

- `npm run verify:structure`: PASS
- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm test`: PASS
- `npm run quality`: PASS

## Performance And Dependency Notes

- This slice does not change runtime behavior or database access patterns.
- It improves delivery performance by preventing future feature slices from mixing behavior changes with emergency file-size surgery.
- No OCR, RAG, model, training, scoring, or Python worker dependency was added.

## Rollback

Move the split path objects back into `contracts/openapi/teaching-archive.yaml`, move test helpers back into `server_test.go`, remove SDD 0041 checks from `tools/verify-structure.mjs`, and delete the split files and this report.
