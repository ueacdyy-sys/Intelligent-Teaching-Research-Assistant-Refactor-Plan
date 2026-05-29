# P3 Teaching Archive PostgreSQL Repository Headroom Split

## Slice

- SDD: `docs/sdd/0043-teaching-archive-postgres-repository-headroom-split.md`
- Scope: behavior-preserving Teaching Archive PostgreSQL adapter split.
- Goal: make persistence changes reviewable before adding more Teaching Mode data paths.

## Requirement Trace

- Root requirement: Teaching Mode includes AI grading, tutoring mode, student archives, teaching materials, and personalized learning support.
- Root requirement: archive materials include quizzes, papers, handouts, homework, and teaching materials.
- Whole-system map: modules are delivery slices under the full product boundary.
- SDD 0014: strict quality gate rejects oversized files and architecture boundary drift.
- SDD 0041 and SDD 0042: prior headroom work keeps feature slices separate from structural cleanup.

## Red Evidence

After adding SDD 0043 structure requirements and before the split, `npm run verify:structure` failed as expected:

- Missing `services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go`.
- Missing `services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go`.
- Missing `services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go`.
- Missing `services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_request.go`.
- Missing `services/teaching-archive-gateway/internal/adapter/postgres/repository_scanners.go`.
- Missing `services/teaching-archive-gateway/internal/adapter/postgres/repository_helpers.go`.

Pre-split line counts:

- `services/teaching-archive-gateway/internal/adapter/postgres/repository.go`: 769 lines.
- `services/teaching-archive-gateway/internal/adapter/httpapi/server.go`: 350 lines.
- `tools/verify-structure.mjs`: 618 lines.

## Implementation

- Added SDD 0043 for PostgreSQL repository headroom.
- Added structure verifier requirements for the new PostgreSQL adapter split files.
- Added a `repository.go <= 180` headroom gate.
- Moved schema setup and schema statements into `repository_schema.go`.
- Moved archive item create, get, and list SQL into `repository_archive_items.go`.
- Moved tutoring-analysis create, get, list, worker claim, and worker result SQL into `repository_tutoring_analysis.go`.
- Moved AI grading request insert SQL into `repository_ai_grading_request.go`.
- Moved archive item and tutoring-analysis row scanners into `repository_scanners.go`.
- Moved shared PostgreSQL helper functions into `repository_helpers.go`.
- Kept SQL text, ordering, filters, claim semantics, result guard semantics, nullable conversions, and public method signatures unchanged.

Post-split line counts:

- `services/teaching-archive-gateway/internal/adapter/postgres/repository.go`: 27 lines.
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go`: 133 lines.
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go`: 150 lines.
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go`: 305 lines.
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_request.go`: 43 lines.
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_scanners.go`: 128 lines.
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_helpers.go`: 18 lines.

## Verification

- `npm run verify:structure`: PASS
- `go test ./services/teaching-archive-gateway/internal/adapter/postgres`: PASS
- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm test`: PASS
- `npm run quality`: PASS

## Performance And Dependency Notes

- This slice does not change runtime behavior, SQL semantics, connection pools, indexes, or database access patterns.
- It improves development throughput by separating schema, archive item persistence, tutoring-analysis persistence, scanners, and shared helpers.
- No OCR, RAG, model, training, scoring, or Python worker dependency was added.

## Rollback

Move schema setup, archive item persistence, tutoring-analysis persistence, AI grading insert persistence, scanners, and helpers back into `repository.go`, remove SDD 0043 checks from `tools/verify-structure.mjs`, and delete the split files and this report.
