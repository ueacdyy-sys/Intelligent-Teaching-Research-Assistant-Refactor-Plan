# SDD 0041: Teaching Archive Quality Headroom Split

## Problem

The Teaching Archive slice is now large enough that two core files sit one line change away from the strict 800-line quality gate:

- `contracts/openapi/teaching-archive.yaml`: 797 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_test.go`: 799 lines.

Future Teaching Mode slices still need to add quiz, AI grading result, student archive, and worker handoff behavior. If the current contract and HTTP test files stay near the hard limit, the next feature will mix behavior work with emergency file surgery. This slice creates quality headroom first, without changing API behavior, SQL semantics, authorization, or runtime dependencies.

## Source Requirement References

- Root requirement: Teaching Mode includes AI grading, tutoring mode, student archives, teaching materials, and personalized learning support.
- Root requirement: AI grading keeps existing function while reserving OCR or handwriting recognition for precise scoring.
- Root requirement: archive materials include quizzes, papers, handouts, homework, and teaching materials.
- Whole-system invariant: modules are execution slices, not isolated rewrites.
- SDD 0014: strict quality gate rejects oversized files.
- SDD 0033 through SDD 0040: Teaching Archive has accumulated request, query, worker claim, and worker result API surfaces.

## Scope

In scope:

- Split existing Teaching Archive HTTP test helpers out of `server_test.go`.
- Split existing tutoring-analysis OpenAPI path objects out of `teaching-archive.yaml`.
- Add executable structure checks that enforce quality headroom for the split files.
- Keep all route paths, operation IDs, schemas, response shapes, status codes, and authorization behavior unchanged.
- Keep `npm test` Docker-free.

Out of scope:

- New API behavior.
- SQL schema changes.
- Database performance changes.
- Python worker implementation.
- OCR, RAG, model, scoring, or training dependencies.
- TypeScript SDK generation.

## Contracts

Updated structure contract:

- `tools/verify-structure.mjs`

New or split contract files:

- `contracts/openapi/teaching-archive.tutoring-analysis-requests.path.yaml`
- `contracts/openapi/teaching-archive.tutoring-analysis-worker-claims.path.yaml`
- `contracts/openapi/teaching-archive.tutoring-analysis-worker-result.path.yaml`

Go test organization:

- `services/teaching-archive-gateway/internal/adapter/httpapi/server_test.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_test_helpers_test.go`

## Acceptance Criteria

- Structure verification fails before the split because the new split files are missing and the old files exceed the headroom thresholds.
- `teaching-archive.yaml` delegates tutoring-analysis paths to dedicated path files and stays at or below 700 lines.
- `server_test.go` keeps only HTTP behavior tests and stays at or below 500 lines.
- `server_test_helpers_test.go` owns shared HTTP test fixtures, fake repositories, principals, fixed ID, and fixed clock helpers.
- Teaching Archive HTTP tests still pass without behavior changes.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Move the tutoring-analysis path objects back into `teaching-archive.yaml`, move HTTP test helpers back into `server_test.go`, remove the SDD 0041 structure checks, and delete the split files. Because this slice is behavior-preserving, rollback only changes file organization.

## Observability And Performance Evidence

Record:

- failing structure-verifier evidence before the split.
- line counts before and after the split.
- targeted Teaching Archive Go test result.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
